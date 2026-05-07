/**
 * Vercel Cron: /api/cron/audit-pending-community
 * Runs hourly.
 *
 * For every user-submitted recipe in moderation_status='pending' that hasn't
 * been audited yet (or was audited > 7 days ago), runs a Haiku step-quality
 * audit and stores the result on the recipe's `audit_data` jsonb column.
 *
 * Admin sees the audit_data score in Supabase Studio when reviewing the
 * pending queue — gives a fast signal of which recipes need a closer look
 * before approving for public visibility.
 *
 * Schema written to recipes.audit_data:
 *   {
 *     score: 0-100,           // Haiku cookability score
 *     category: string,        // ok | missing_steps | wrong_times | wrong_technique | etc.
 *     issues: string[],        // concrete observations
 *     audited_at: ISO string,
 *     ingredient_hash: string  // hash of ingredients+steps; re-audit if hash changes
 *   }
 *
 * NOTE: this only audits step quality. Macro accuracy still flows through
 * /api/macros (AI estimator). Calculator-grade macros for community recipes
 * require a separate periodic batch run via scripts/compute-macros-from-usda.mjs
 * — see .claude/recipe-quality-overhaul-2026-05-07.md for the full pipeline.
 *
 * Trigger manually: GET /api/cron/audit-pending-community
 *   with Authorization: Bearer <CRON_SECRET>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { verifyCronAuth } from './_auth';

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

const RUBRIC = `You are a culinary editor reviewing a community-submitted recipe before it goes public. Score the recipe's STEPS on a 0-100 scale based on how cookable, complete, and accurate they are.

OUTPUT (JSON only, no prose, no markdown fences):
{
  "score": 0-100,
  "issues": ["..."],
  "category": "ok" | "missing_steps" | "wrong_times" | "wrong_technique" | "missing_ingredients" | "ingredient_mismatch" | "incomplete" | "ambiguous"
}

SCORING:
- 100: clear, complete, references all ingredients, plausible times, technique matches dish
- 95-99: minor wording issues
- 90-94: small problems (one ingredient not added, generic time)
- 80-89: notable issues (missing key step, technique mismatch, wrong cook time)
- 60-79: serious gaps
- <60: broken; cannot be cooked

CHECKS:
1. Every ingredient should be used in some step. Penalize unused ingredients.
2. Cook times must be plausible: raw chicken breast 6-12 min/side; whole chicken 60-90 min at 400°F; pan-seared steak 3-5 min/side.
3. Technique matches dish: steamed fish ≠ fry; raw salad ≠ boil.
4. Step count appropriate for complexity (lasagna with 2 steps = incomplete; boiled eggs with 2 steps = fine).
5. Reasonable temperatures (oven at 200°F for roasting whole chicken is wrong).
6. Order of operations correct.
7. No duplicate steps.

NON-ISSUES (don't penalize):
- Recipe is short for a simple dish.
- "Salt to taste" is fine.
- Pre-prep embedded in ingredient list ("chopped onion") doesn't need a separate step.

Be calibrated: well-built recipes should score 95-100. Score <90 only when there's a real concrete problem.

Output ONLY the JSON object.`;

function buildUserMsg(recipe: any) {
  const ingredients = (recipe.ingredients || [])
    .map((i: any) => `- ${i.quantity || ''} ${i.unit || ''} ${i.name || ''}`.trim().replace(/\s+/g, ' '))
    .join('\n');
  const steps = (recipe.steps || [])
    .map((s: any, idx: number) => `${idx + 1}. ${s.instruction || s.title || ''}`.trim())
    .join('\n');
  return `Title: ${recipe.title}
Servings: ${recipe.servings || 4}

Ingredients:
${ingredients || '(none listed)'}

Steps:
${steps || '(no steps listed)'}

Score?`;
}

function hashRecipe(recipe: any): string {
  const payload = JSON.stringify({
    ingredients: recipe.ingredients || [],
    steps: recipe.steps || [],
    title: recipe.title,
    servings: recipe.servings,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

async function scoreRecipe(anthropic: Anthropic, recipe: any) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: RUBRIC,
    messages: [
      { role: 'user', content: buildUserMsg(recipe) },
      { role: 'assistant', content: '{' },
    ],
  });
  const raw = ('{' + (msg.content[0] as any).text).trim();
  const cleaned = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
  let parsed: any;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No JSON in Haiku response');
    parsed = JSON.parse(m[0]);
  }
  return {
    score: typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 50,
    category: parsed.category || 'ok',
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
  };
}

const STALE_AUDIT_DAYS = 7;
const BATCH_LIMIT = 50; // cap per cron run to keep within Vercel duration

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
  if (!verifyCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured' });
  const anthropic = new Anthropic({ apiKey });

  const sb = getSupabase();
  const { data: pending, error } = await sb
    .from('recipes')
    .select('id, title, servings, ingredients, steps, audit_data')
    .eq('source_type', 'community')
    .eq('moderation_status', 'pending')
    .limit(BATCH_LIMIT);

  if (error) return res.status(500).json({ error: 'Failed to fetch pending recipes', details: error.message });

  const cutoff = new Date(Date.now() - STALE_AUDIT_DAYS * 86_400_000).toISOString();
  let audited = 0;
  let skipped = 0;
  let errored = 0;
  const startedAt = Date.now();

  for (const recipe of pending || []) {
    const ingestedHash = hashRecipe(recipe);
    const existing = recipe.audit_data;
    if (existing && existing.ingredient_hash === ingestedHash && existing.audited_at > cutoff) {
      skipped++;
      continue;
    }
    try {
      const result = await scoreRecipe(anthropic, recipe);
      const audit_data = {
        ...result,
        audited_at: new Date().toISOString(),
        ingredient_hash: ingestedHash,
      };
      const { error: upErr } = await sb.from('recipes').update({ audit_data }).eq('id', recipe.id);
      if (upErr) { errored++; continue; }
      audited++;
    } catch (e) {
      errored++;
    }
    // pacing
    await new Promise((r) => setTimeout(r, 100));
  }

  return res.status(200).json({
    pending_total: pending?.length ?? 0,
    audited,
    skipped_already_current: skipped,
    errored,
    duration_ms: Date.now() - startedAt,
  });
}
