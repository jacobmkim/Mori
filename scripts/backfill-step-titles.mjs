import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateStepTitles(steps) {
  const prompt = `Generate concise 3-5 word summaries for each cooking step. Return JSON only.

Steps:
${steps.map((s, i) => `${i + 1}. ${s.instruction}`).join('\n')}

Return format:
{ "titles": ["title1", "title2", ...] }

Rules:
- Start with action verb (e.g., "Prepare", "Mix", "Cook", "Simmer")
- 3-5 words max
- Capture the key action, not every detail
- Examples: "Beat egg mixture", "Prepare steamer", "Simmer until thickened"`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim();
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const result = JSON.parse(cleaned);
  return result.titles;
}

async function backfillRecipe(recipe) {
  const steps = recipe.steps || [];
  if (steps.length === 0) return;

  // Skip if already has titles
  if (steps.some(s => s.title)) {
    console.log(`  ✓ ${recipe.title} - already has titles`);
    return;
  }

  try {
    const titles = await generateStepTitles(steps);
    const updatedSteps = steps.map((step, i) => ({
      ...step,
      title: titles[i] || step.instruction.split(' ').slice(0, 4).join(' ')
    }));

    await supabase
      .from('recipes')
      .update({ steps: updatedSteps })
      .eq('id', recipe.id);

    console.log(`  ✓ ${recipe.title} - added ${titles.length} titles`);
  } catch (err) {
    console.error(`  ✗ ${recipe.title} - ${err.message}`);
  }
}

async function main() {
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, title, steps')
    .not('steps', 'is', null);

  if (error) throw error;

  console.log(`Backfilling step titles for ${recipes.length} recipes...\n`);

  // Process in batches of 10 to avoid rate limits
  for (let i = 0; i < recipes.length; i += 10) {
    const batch = recipes.slice(i, i + 10);
    await Promise.all(batch.map(backfillRecipe));
    await new Promise(r => setTimeout(r, 1000)); // 1s between batches
  }

  console.log('\n✓ Backfill complete');
}

main().catch(console.error);
