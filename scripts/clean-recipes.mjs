// Deep-clean curated recipes in Supabase:
// 1. Dedup — find similar-dish clusters, keep the best, delete the rest
// 2. Tag fix — re-validate every recipe's dietary_tags against its ingredients
//
// Uses Claude Haiku directly (not via Vercel) for cheap, fast validation.
//
// Usage:
//   node scripts/clean-recipes.mjs --dry-run    # preview changes, nothing deleted
//   node scripts/clean-recipes.mjs              # LIVE: deletes dupes + fixes tags
//   node scripts/clean-recipes.mjs --tags-only  # only fix tags, skip dedup
//   node scripts/clean-recipes.mjs --dedup-only # only dedup, skip tag fix

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Env ───────────────────────────────────────────────────────────────────────

const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const SUPABASE_URL = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const ANTHROPIC_KEY = envVars['ANTHROPIC_API_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_KEY) {
  console.error('Missing env vars: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const ai = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const TAGS_ONLY  = args.includes('--tags-only');
const DEDUP_ONLY = args.includes('--dedup-only');
const DELAY_MS   = 800;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Haiku helpers ─────────────────────────────────────────────────────────────

async function askHaiku(prompt) {
  const msg = await ai.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text.trim();
}

// ── Step 1: Dedup ─────────────────────────────────────────────────────────────

// Normalize title: lowercase, strip parenthetical, strip filler words
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, '')            // strip (foreign name)
    .replace(/[^\w\s]/g, ' ')           // remove punctuation
    .replace(/\b(with|and|in|the|a|an|of|on|for|à|au|al|di|de|la|le)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Jaccard word overlap between two normalised titles
function jaccard(a, b) {
  const sa = new Set(a.split(' ').filter(Boolean));
  const sb = new Set(b.split(' ').filter(Boolean));
  const inter = [...sa].filter(w => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

// Union-find for grouping overlapping pairs
class UnionFind {
  constructor() { this.parent = {}; }
  find(x) {
    if (this.parent[x] === undefined) this.parent[x] = x;
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(x, y) { this.parent[this.find(x)] = this.find(y); }
  groups(ids) {
    const map = {};
    for (const id of ids) {
      const root = this.find(id);
      (map[root] = map[root] || []).push(id);
    }
    return Object.values(map).filter(g => g.length > 1);
  }
}

async function dedupCuisine(cuisine, recipes) {
  const uf = new UnionFind();
  const norms = recipes.map(r => ({ id: r.id, norm: normalizeTitle(r.title) }));

  // Find pairs with high overlap
  for (let i = 0; i < norms.length; i++) {
    for (let j = i + 1; j < norms.length; j++) {
      if (jaccard(norms[i].norm, norms[j].norm) >= 0.55) {
        uf.union(norms[i].id, norms[j].id);
      }
    }
  }

  const groups = uf.groups(recipes.map(r => r.id));
  if (groups.length === 0) return { toDelete: [], kept: [] };

  const toDelete = [];
  const kept = [];

  for (const group of groups) {
    const members = group.map(id => recipes.find(r => r.id === id));

    // Ask Haiku: are these the same dish? Which is best to keep?
    const listText = members.map((r, i) =>
      `[${i + 1}] "${r.title}"\n     Ingredients: ${JSON.stringify((r.ingredients || []).slice(0, 5).map(ing => ing.name))}`
    ).join('\n\n');

    const prompt = `You are auditing a recipe database. These ${cuisine} recipes may be duplicates (same dish with slight title variations).\n\n${listText}\n\nAnswer with valid JSON only:\n{"same_dish": true/false, "keep_index": 1 (1-based index of best version to keep — most complete title, most authentic), "reason": "one line"}\n\nIf they are genuinely different dishes, set same_dish: false.`;

    let result;
    try {
      const raw = await askHaiku(prompt);
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      // Can't parse — skip this group, keep all
      console.log(`    ⚠ Could not parse Haiku response for group, skipping`);
      continue;
    }

    if (!result.same_dish) {
      console.log(`    ✓ Not duplicates: "${members.map(m => m.title).join('" vs "')}"`);
      continue;
    }

    const keepIdx = (result.keep_index ?? 1) - 1;
    const keepRecipe = members[Math.min(keepIdx, members.length - 1)];
    const deleteRecipes = members.filter(m => m.id !== keepRecipe.id);

    console.log(`    🗑  Same dish: keeping "${keepRecipe.title}"`);
    deleteRecipes.forEach(r => console.log(`       → delete: "${r.title}"`));

    kept.push(keepRecipe.title);
    toDelete.push(...deleteRecipes.map(r => r.id));

    await sleep(DELAY_MS);
  }

  return { toDelete, kept };
}

// ── Step 2: Tag Validation ────────────────────────────────────────────────────

const VALID_TAGS = ['vegan', 'vegetarian', 'pescatarian', 'gluten_free', 'dairy_free',
                    'keto', 'high_protein', 'low_carb', 'paleo', 'halal'];

// Tag validation rules applied before calling Haiku (fast, no API cost)
function localTagFix(recipe) {
  const tags = [...(recipe.dietary_tags || [])];
  const ingr = JSON.stringify(recipe.ingredients || '').toLowerCase();
  const title = recipe.title.toLowerCase();

  const hasMeat = /\b(chicken|beef|pork|lamb|duck|turkey|veal|chorizo|bacon|sausage|ham|prosciutto|pancetta)\b/.test(ingr + ' ' + title);
  const hasSeafood = /\b(fish|shrimp|prawn|salmon|tuna|cod|crab|lobster|clam|mussel|squid|octopus|scallop|anchovy|mackerel|trout|sea bass|branzino|sole|tilapia)\b/.test(ingr + ' ' + title);
  const hasDairy = /\b(milk|cream|butter|cheese|yogurt|parmesan|ricotta|mozzarella|feta|cheddar|gouda|brie|halloumi)\b/.test(ingr);
  const hasEggs = /\begg(s)?\b/.test(ingr);
  const hasPork = /\b(pork|bacon|ham|chorizo|sausage|prosciutto|pancetta|lard)\b/.test(ingr + ' ' + title);
  const hasAlcohol = /\b(wine|beer|cider|sake|rum|brandy|whiskey|mirin|cooking wine|rice wine|shaoxing)\b/.test(ingr);
  const hasGluten = /\b(flour|pasta|spaghetti|fettuccine|penne|linguine|rigatoni|bread|breadcrumb|soy sauce|oyster sauce|noodle|wheat|barley|rye|couscous|orzo)\b/.test(ingr);
  const hasGlutenFreeNoodle = /\b(rice noodle|glass noodle|rice flour|gluten.free)\b/.test(ingr);

  const fixed = [];

  // vegan: no meat, seafood, dairy, eggs
  if (tags.includes('vegan') && (hasMeat || hasSeafood || hasDairy || hasEggs)) {
    // Remove vegan; check if vegetarian is valid
    if (!hasMeat && !hasSeafood) fixed.push('vegetarian'); // has dairy/eggs but no meat
  } else if (tags.includes('vegan')) {
    fixed.push('vegan', 'vegetarian');
  }

  // vegetarian: no meat, seafood
  if (!fixed.includes('vegetarian') && tags.includes('vegetarian') && !hasMeat && !hasSeafood) {
    fixed.push('vegetarian');
  }

  // pescatarian: has seafood, no land meat
  if (tags.includes('pescatarian') && hasMeat && !hasSeafood) {
    // Remove pescatarian — it's land meat, not fish
  } else if (tags.includes('pescatarian') && (hasSeafood || !hasMeat)) {
    fixed.push('pescatarian');
  }

  // halal: no pork, no alcohol
  if (tags.includes('halal') && (hasPork || hasAlcohol)) {
    // Drop halal
  } else if (tags.includes('halal')) {
    fixed.push('halal');
  }

  // gluten_free: no gluten ingredients (unless GF variant)
  if (tags.includes('gluten_free') && hasGluten && !hasGlutenFreeNoodle) {
    // Drop gluten_free
  } else if (tags.includes('gluten_free')) {
    fixed.push('gluten_free');
  }

  // Carry through remaining tags unchanged
  for (const tag of tags) {
    if (!['vegan', 'vegetarian', 'pescatarian', 'halal', 'gluten_free'].includes(tag)) {
      if (VALID_TAGS.includes(tag)) fixed.push(tag);
    }
  }

  // Auto-add pescatarian if seafood only
  if (hasSeafood && !hasMeat && !fixed.includes('pescatarian')) {
    fixed.push('pescatarian');
  }

  return [...new Set(fixed)]; // deduplicate
}

async function fixTagsWithHaiku(recipe) {
  const ingrNames = (recipe.ingredients || []).slice(0, 15).map(i => i.name).join(', ');
  const prompt = `Recipe: "${recipe.title}" (${recipe.cuisine})\nKey ingredients: ${ingrNames}\n\nReturn ONLY a JSON array of applicable dietary tags from this list: ${VALID_TAGS.join(', ')}\nRules:\n- vegan: no meat, fish, dairy, or eggs whatsoever\n- vegetarian: no meat or fish (dairy/eggs ok)\n- pescatarian: fish/seafood only, no land meat\n- halal: no pork, no alcohol (wine, beer, mirin, sake, rice wine, shaoxing)\n- gluten_free: no wheat flour, regular pasta, regular soy sauce, regular bread (rice noodles = ok)\n- high_protein: >25g protein per serving\n- paleo: no grains, no legumes, no dairy\n- dairy_free: no milk, butter, cream, or any cheese\n\nReturn only the JSON array, no explanation.`;

  try {
    const raw = await askHaiku(prompt);
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const tags = JSON.parse(cleaned);
    if (!Array.isArray(tags)) throw new Error('not array');
    return tags.filter(t => VALID_TAGS.includes(t));
  } catch {
    return null; // fall back to local fix
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🧹 Mise Recipe Cleaner`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  const { data: recipes, error } = await sb
    .from('recipes')
    .select('id, title, cuisine, dietary_tags, ingredients, servings, steps, macros')
    .eq('source_type', 'curated')
    .order('cuisine')
    .order('title');

  if (error) { console.error('Supabase error:', error); process.exit(1); }

  console.log(`Loaded ${recipes.length} curated recipes\n`);

  // Group by cuisine
  const byCuisine = {};
  for (const r of recipes) {
    const c = r.cuisine || 'unknown';
    (byCuisine[c] = byCuisine[c] || []).push(r);
  }

  // ── DEDUP ──────────────────────────────────────────────────────────────────

  let totalDeleted = 0;

  if (!TAGS_ONLY) {
    console.log('═══ STEP 1: DEDUPLICATION ═══\n');

    for (const [cuisine, cRecipes] of Object.entries(byCuisine)) {
      console.log(`── ${cuisine.toUpperCase()} (${cRecipes.length} recipes) ──`);
      const { toDelete } = await dedupCuisine(cuisine, cRecipes);

      if (toDelete.length > 0) {
        console.log(`  → ${toDelete.length} to delete`);
        if (!DRY_RUN) {
          // Cascade-delete FK-dependent rows before deleting recipes
          const fkTables = ['swipe_events', 'saved_recipes', 'recipe_interactions', 'recipe_cohort_affinities'];
          for (const table of fkTables) {
            const { error: fkErr } = await sb.from(table).delete().in('recipe_id', toDelete);
            if (fkErr) console.log(`  ⚠ FK cleanup error (${table}): ${fkErr.message}`);
          }
          const { error: delErr } = await sb.from('recipes').delete().in('id', toDelete);
          if (delErr) console.log(`  ⚠ Delete error: ${delErr.message}`);
          else {
            totalDeleted += toDelete.length;
            // Remove from local list for tag step
            for (const id of toDelete) {
              const idx = byCuisine[cuisine].findIndex(r => r.id === id);
              if (idx !== -1) byCuisine[cuisine].splice(idx, 1);
            }
          }
        }
      } else {
        console.log(`  ✓ No duplicates found`);
      }
      console.log();
    }

    console.log(`Dedup complete. ${DRY_RUN ? '(dry run)' : `Deleted ${totalDeleted} duplicates`}\n`);
  }

  // ── TAG FIX ────────────────────────────────────────────────────────────────

  if (!DEDUP_ONLY) {
    console.log('═══ STEP 2: TAG VALIDATION ═══\n');

    let tagFixed = 0;
    let tagSkipped = 0;
    const remaining = Object.values(byCuisine).flat();

    for (const recipe of remaining) {
      // Fast local check first
      const localFixed = localTagFix(recipe);
      const localChanged = JSON.stringify([...localFixed].sort()) !== JSON.stringify([...(recipe.dietary_tags || [])].sort());

      let finalTags = localFixed;
      let source = 'local';

      // If local check made changes or recipe has suspicious combos, confirm with Haiku
      if (localChanged) {
        await sleep(DELAY_MS);
        const haikuTags = await fixTagsWithHaiku(recipe);
        if (haikuTags) { finalTags = haikuTags; source = 'haiku'; }
      }

      const changed = JSON.stringify([...finalTags].sort()) !== JSON.stringify([...(recipe.dietary_tags || [])].sort());

      if (changed) {
        console.log(`  📝 ${recipe.cuisine} | ${recipe.title.substring(0, 50)}`);
        console.log(`     was:  [${(recipe.dietary_tags || []).join(', ')}]`);
        console.log(`     now:  [${finalTags.join(', ')}] (${source})`);

        if (!DRY_RUN) {
          const { error: updateErr } = await sb
            .from('recipes')
            .update({ dietary_tags: finalTags })
            .eq('id', recipe.id);
          if (updateErr) console.log(`     ⚠ Update error: ${updateErr.message}`);
          else tagFixed++;
        } else {
          tagFixed++;
        }
      } else {
        tagSkipped++;
      }
    }

    console.log(`\nTag fix complete. ${DRY_RUN ? '(dry run) ' : ''}Fixed: ${tagFixed}, unchanged: ${tagSkipped}\n`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  if (!DRY_RUN) {
    const { count } = await sb.from('recipes').select('*', { count: 'exact', head: true }).eq('source_type', 'curated');
    console.log(`✅ Done. ${count} curated recipes remain in DB.`);
  } else {
    console.log(`✅ Dry run complete. Run without --dry-run to apply changes.`);
  }
}

main().catch(console.error);
