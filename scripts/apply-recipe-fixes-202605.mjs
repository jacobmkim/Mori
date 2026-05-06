/**
 * apply-recipe-fixes-202605.mjs — one-shot
 *
 * Applies the 8 recipe fixes from scripts/reports/recipe-fixes-2026-05-05.md
 * directly to Supabase. Each update is logged. Original state was saved to
 * scripts/reports/_8-recipe-current-state.json (rollback artifact).
 *
 * Usage:
 *   node scripts/apply-recipe-fixes-202605.mjs            # apply all 8
 *   node scripts/apply-recipe-fixes-202605.mjs --dry-run  # preview
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const sb = createClient(envVars['EXPO_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY']);
const DRY = process.argv.includes('--dry-run');

const FIXES = [
  // ── 1. Skillet Honey Garlic Salmon ───────────────────────────────────────
  {
    id: '16ac185b-bee0-4d25-b591-8d767787a875',
    title: 'Skillet Honey Garlic Salmon and Potatoes',
    update: {
      cook_time_mins: 30,
      steps: [
        { order: 1, title: 'Cook potatoes covered, then crisp', instruction: 'Cut potatoes into 1-inch cubes. Heat 2 tbsp oil in a large skillet over medium-high heat. Add potatoes, season with salt and pepper, then cover the skillet. Cook covered for 12 minutes, stirring once, until potatoes are fork-tender. Uncover and cook 6-8 minutes more, turning occasionally, until golden and crisp. Transfer to a plate.' },
        { order: 2, title: 'Mince garlic and mix sauce', instruction: 'Mince the garlic cloves finely. In a small bowl, whisk together honey, soy sauce, rice vinegar, water, and minced garlic.' },
        { order: 3, title: 'Pan-sear salmon fillets', instruction: 'Pat salmon dry with paper towels and season both sides with salt and pepper. Add remaining 2 tbsp oil to the same skillet over medium-high heat. Once hot, place salmon skin-side up and cook for 3-4 minutes until the bottom is golden. Flip and cook for another 2-3 minutes until just cooked through.' },
        { order: 4, title: 'Build the glaze off heat', instruction: 'Reduce heat to low. Pour the honey garlic sauce into the skillet around the salmon and let it bubble for 60-90 seconds until syrupy. Remove pan from heat, return cooked potatoes, and gently toss to coat — keeping the pan off heat prevents the salmon from overcooking and the glaze from candying.' },
        { order: 5, title: 'Finish and serve', instruction: 'Slice spring onions thinly, separating white and green parts. Sprinkle white parts over the dish, add sesame seeds, and toss gently. Serve immediately, garnishing with green spring onion tops.' },
      ],
    },
  },
  // ── 2. Egg Drop Soup ─────────────────────────────────────────────────────
  {
    id: 'c5ec38bd-c8cd-454e-bcc6-45f476f45e72',
    title: 'Egg Drop Soup',
    appendIngredients: [{ name: 'eggs', quantity: '3', unit: 'large' }],
    update: {
      steps: [
        { order: 1, title: 'Boil chicken stock', instruction: 'Pour the chicken stock into a wok and bring it to a boil over medium-high heat.' },
        { order: 2, title: 'Season broth with aromatics', instruction: 'Add the salt, sugar, pepper, and sesame oil to the boiling broth and stir to combine.' },
        { order: 3, title: 'Cook peas and mushrooms', instruction: 'Add the peas and mushrooms to the wok and let them cook for 2 minutes.' },
        { order: 4, title: 'Reduce heat, thicken with cornstarch', instruction: 'Reduce heat to a gentle simmer (lots of small bubbles, no rolling boil) — this is critical for a smooth, lump-free thickening. In a small bowl, whisk together the cornstarch and water until smooth. Pour the slurry into the soup in a thin stream while stirring continuously. Simmer 30-45 seconds for the cornstarch to fully hydrate and the soup to thicken silkily.' },
        { order: 5, title: 'Create egg ribbons', instruction: 'Lightly beat the eggs with a fork. With the soup at a gentle simmer (not boiling), slowly drizzle the beaten eggs in a thin stream around the wok while stirring gently and constantly for 20-30 seconds — the eggs will form delicate, silky ribbons. Do not over-stir or the eggs will break into shreds.' },
        { order: 6, title: 'Serve in bowls garnished', instruction: 'Ladle the soup into bowls and garnish with chopped green onions. Serve immediately.' },
      ],
    },
  },
  // ── 3. Spanish Rice & Prawn ──────────────────────────────────────────────
  {
    id: '23aba518-8343-4318-be88-bfdc9d965152',
    title: 'Spanish rice & prawn one-pot',
    update: {
      ingredients: [
        { name: 'onion', quantity: '1', unit: '' },
        { name: 'red pepper', quantity: '1', unit: '' },
        { name: 'green pepper', quantity: '1', unit: '' },
        { name: 'chorizo', quantity: '8', unit: 'oz' },
        { name: 'garlic cloves', quantity: '2', unit: '' },
        { name: 'olive oil', quantity: '2', unit: 'tbsp' },
        { name: 'smoked paprika', quantity: '1', unit: 'tsp' },
        { name: 'basmati rice', quantity: '1.5', unit: 'cup' },
        { name: 'canned tomatoes', quantity: '1', unit: 'can (14 oz)' },
        { name: 'vegetable or seafood stock', quantity: '2', unit: 'cups' },
        { name: 'prawns', quantity: '1.25', unit: 'lb' },
      ],
      steps: [
        { order: 1, title: 'Heat stock', instruction: 'Bring the vegetable or seafood stock to a simmer in a kettle or pot and keep warm.' },
        { order: 2, title: 'Sweat vegetables, then garlic', instruction: 'Heat the olive oil in a non-stick frying pan or shallow pan with a lid over medium heat (not medium-high — too hot will burn the garlic later). Add the sliced onion, red pepper, and green pepper. Sweat for 4-5 minutes until softened. Add the chorizo and cook 2 more minutes. Then add the minced garlic and smoked paprika and cook 30-45 seconds, just until fragrant — do not let the garlic colour.' },
        { order: 3, title: 'Toast rice and add liquid', instruction: 'Stir in the basmati rice and toast for 1 minute, coating each grain in oil. Add the tinned tomatoes and the 2 cups of warm stock. Stir well, bring to a simmer, then cover the pan and reduce heat to medium-low. Cook for 12-14 minutes — basmati cooks quickly, so check at 12 min.' },
        { order: 4, title: 'Check rice doneness', instruction: 'Uncover the pan and stir gently. The rice should be just tender with most liquid absorbed. If the rice still has bite, replace lid for 2 more minutes.' },
        { order: 5, title: 'Cook prawns until opaque', instruction: 'Add the prawns, season with salt and pepper, cover, and cook for 3-4 minutes until the prawns turn opaque pink and reach an internal temperature of 145°F. Serve immediately.' },
      ],
    },
  },
  // ── 4. Sheet Pan Chipotle Pork ───────────────────────────────────────────
  {
    id: 'e9d3a9cc-008a-4bc2-ac58-ebccbf9b29b0',
    title: 'Sheet Pan Chipotle Pork with Sweet Potatoes',
    appendIngredients: [{ name: 'chicken stock', quantity: '1', unit: 'cup' }],
    update: {
      cook_time_mins: 160,
      steps: [
        { order: 1, title: 'Prepare the marinade', instruction: 'In a small bowl, combine 3 chipotle peppers from the can (chopped), 2 tbsp of the adobo sauce, juice of 1 lime, 4 minced garlic cloves, 1 tbsp cumin, 1 tsp salt, and 0.5 tsp black pepper. Stir until it forms a paste.' },
        { order: 2, title: 'Rub and season pork', instruction: 'Pat the pork shoulder dry. Cut into 4-5 large chunks (leave skin on if attached). Rub the chipotle paste all over the pork pieces, working it into any crevices. Let sit for 10 minutes while you prep the vegetables.' },
        { order: 3, title: 'Slice onions, prep pan', instruction: 'Slice onions into thick wedges. Spread onions across a deep sheet pan or roasting pan, then nestle the pork pieces on top. Pour 1 cup chicken stock into the bottom of the pan.' },
        { order: 4, title: 'Cover and braise low', instruction: 'Preheat oven to 325°F. Drizzle 2 tbsp olive oil over the pork. Cover the pan tightly with foil. Roast for 2 hours — the pork will braise in the stock and become fork-tender.' },
        { order: 5, title: 'Add sweet potatoes, finish uncovered', instruction: 'Cut sweet potatoes into 1.25-inch chunks and toss with remaining 2 tbsp oil, a pinch of salt, and pepper. After 2 hours, remove foil from the pan, scatter the sweet potatoes around the pork, and increase oven to 400°F. Roast uncovered for 30-40 minutes more, stirring potatoes once halfway, until pork is browned on top and sweet potatoes are fork-tender. Pork internal temp should reach 195°F for shred-tender.' },
        { order: 6, title: 'Rest and finish', instruction: 'Remove from oven and let rest for 10 minutes. Squeeze juice from the remaining lime over the pan. Shred or slice the pork. Taste and adjust seasoning if needed. Serve straight from the pan.' },
      ],
    },
  },
  // ── 5. Lamb Biryani ──────────────────────────────────────────────────────
  {
    id: 'f64e2eb5-9df5-4e68-bda0-3a26c6e3ff84',
    title: 'Lamb Biryani',
    update: {
      prep_time_mins: 25,
      cook_time_mins: 75,
      steps: [
        { order: 1, title: 'Grind paste, fry onions', instruction: 'Grind the cashew nuts, khus khus, and cumin seeds into a smooth paste using minimal water. Set aside. Heat 2 tablespoons of ghee in a deep pan over medium-high heat and deep fry the thinly sliced onions in batches until light golden brown. Remove with a slotted spoon and drain on paper towels. In the same ghee, fry the cashew nuts until golden brown and set aside.' },
        { order: 2, title: 'Soak rice, cook aromatics', instruction: 'Wash the basmati rice and soak in water for 20 minutes. In a large heavy-bottomed pan, heat remaining ghee over medium heat. Add the fried onions, cashew paste, green chillies, and ginger-garlic paste. Cook for 2-3 minutes, stirring constantly, until the raw smell of the ginger-garlic is gone and the mixture is fragrant — do not rush this step.' },
        { order: 3, title: 'Cook tomatoes, temper yogurt, add lamb', instruction: 'Add the chopped tomatoes and sauté until cooked but not mushy, about 5-7 minutes. Stir in the red chilli powder, mint leaves, and cilantro. Cook for 1 minute, then remove the pan from heat. Whisk the yogurt in a small bowl with 1 tbsp warm water to thin it, then stir into the pan off heat for 30 seconds — this prevents curdling. Return to medium-low heat and add the cubed lamb with salt and ½ cup water.' },
        { order: 4, title: 'Braise lamb until tender', instruction: 'Cover the pan and braise over medium-low heat for 45-60 minutes until the lamb is fork-tender. Stir every 15 minutes. If excess water remains at the end, uncover and cook on high heat to evaporate it completely.' },
        { order: 5, title: 'Boil rice until 80 percent done', instruction: 'In a separate large pot, bring water to a rolling boil with the bay leaf, cinnamon stick, cardamom pods, and cloves. Add the soaked rice and salt. Boil for 6-8 minutes until the rice is about 80% cooked (the grain should still have firm core). Drain the rice immediately.' },
        { order: 6, title: 'Layer rice over lamb', instruction: 'Pat and level the cooked lamb in its pan. Spread the hot drained rice evenly over the top. Drizzle with remaining ghee and the saffron dissolved in 2 tablespoons warm water. Garnish with fried onions, mint leaves, and cilantro.' },
        { order: 7, title: 'Dum: seal and steam', instruction: 'Cover the pan tightly with foil, then a tight-fitting lid. Either bake in a preheated 350°F oven for 20 minutes, or cook on the stovetop on lowest possible heat for 20 minutes. The sealed steam (dum) finishes the rice and infuses the lamb. Turn off the heat and let rest, covered, for 10 minutes.' },
        { order: 8, title: 'Mix and serve hot', instruction: 'Gently mix the biryani with a fork to combine the rice and lamb. Serve hot. If the dish is too spicy, squeeze fresh lemon juice over it to balance the heat.' },
      ],
    },
  },
  // ── 6. Sheet Pan Shrimp Boil ─────────────────────────────────────────────
  {
    id: '2c235676-5140-4e57-99da-b3a7cc6bfcff',
    title: 'Sheet Pan Shrimp Boil with Sausage and Corn',
    appendIngredients: [{ name: 'olive oil', quantity: '2', unit: 'tbsp' }],
    update: {
      cook_time_mins: 42,
      steps: [
        { order: 1, title: 'Preheat and cut vegetables', instruction: 'Preheat oven to 400°F. Cut potatoes into 1-inch chunks (smaller than quarters — this matters for them to cook through). Cut sausage into 1-inch rounds. Cut corn into 2-inch pieces. Mince garlic and set aside.' },
        { order: 2, title: 'Toss potatoes with seasoning', instruction: 'Spread potatoes and sausage on a large sheet pan. Drizzle with 2 tablespoons olive oil (not butter — butter will scorch over the long roast). Sprinkle with 1 tablespoon Old Bay and salt. Toss to coat.' },
        { order: 3, title: 'Roast potatoes and sausage', instruction: 'Roast in preheated oven for 30-35 minutes, stirring halfway through, until potatoes are fork-tender and edges are golden. Do not skip this — undercooked potatoes are the most common failure point of this dish.' },
        { order: 4, title: 'Add shrimp, corn, and butter', instruction: 'Remove pan from oven. Push potatoes and sausage to the sides. Add shrimp and corn to the center. Melt 6 tablespoons butter and combine with the minced garlic, then drizzle over everything. Sprinkle with remaining 1 tablespoon Old Bay.' },
        { order: 5, title: 'Finish cooking together', instruction: 'Return to oven for 6-8 minutes, until shrimp are pink and curled and corn is heated through. Do not overcook shrimp — they go from done to rubbery in under a minute.' },
        { order: 6, title: 'Toss and serve', instruction: 'Remove from oven and toss everything together, coating with the pan juices. Taste and adjust seasoning if needed. Serve hot directly from the pan with lemon wedges if desired.' },
      ],
    },
  },
  // ── 7. Honey Balsamic Wings ──────────────────────────────────────────────
  {
    id: '48ddb229-a45c-48ad-b8c1-b604dbb4e40a',
    title: 'Honey Balsamic Glazed Chicken Wings',
    update: {
      cook_time_mins: 35,
      ingredients: [
        { name: 'chicken wings', quantity: '2.5', unit: 'lb' },
        { name: 'honey', quantity: '2', unit: 'tbsp' },
        { name: 'balsamic vinegar', quantity: '1/4', unit: 'cup' },
        { name: 'water', quantity: '1/4', unit: 'cup' },
        { name: 'garlic cloves', quantity: '4', unit: '' },
        { name: 'olive oil', quantity: '3', unit: 'tbsp' },
        { name: 'fresh rosemary', quantity: '2', unit: 'sprigs' },
        { name: 'salt', quantity: '1', unit: 'tsp' },
        { name: 'black pepper', quantity: '0.5', unit: 'tsp' },
      ],
      steps: [
        { order: 1, title: 'Prepare the chicken', instruction: 'Pat the chicken wings dry with paper towels — dry skin renders far better. Season generously with salt and black pepper on all sides.' },
        { order: 2, title: 'Brown the wings', instruction: 'Heat olive oil in a large heavy-bottomed pan over medium-high heat. Working in batches (do not crowd the pan or wings will steam), brown the wings on each side for 4-5 minutes until deeply golden. Set aside on a plate.' },
        { order: 3, title: 'Build the glaze', instruction: 'Reduce heat to medium-low. Add the minced garlic to the rendered fat in the pan and cook for 30 seconds — do not let it brown. Pour in balsamic vinegar and water first, scraping up any fond. Let bubble 30 seconds, then stir in honey and add rosemary sprigs. The glaze should be thin and pourable, not thick — that\'s correct.' },
        { order: 4, title: 'Return wings, simmer covered', instruction: 'Add the browned wings back to the pan, tossing to coat. Cover and reduce heat to low. Simmer for 18 minutes, turning wings every 5 minutes, until internal temperature reaches 165°F and skin has fully rendered.' },
        { order: 5, title: 'Reduce glaze and finish', instruction: 'Uncover, increase heat to medium, and cook 5-7 more minutes, tossing wings frequently, until the glaze reduces to a syrupy consistency that clings to the wings. Watch closely at this stage — the reduced honey can scorch in under a minute.' },
        { order: 6, title: 'Finish and serve', instruction: 'Remove rosemary sprigs. Transfer wings to a serving platter, drizzling any remaining glaze over the top. Serve hot.' },
      ],
    },
  },
  // ── 8. Pesto Chicken Farro ───────────────────────────────────────────────
  {
    id: '48001f12-7d65-4ad4-bc18-8dccb94dabd7',
    title: 'Pesto Chicken and Farro Bowl',
    update: {
      ingredients: [
        { name: 'chicken breast', quantity: '1.5', unit: 'lb' },
        { name: 'farro', quantity: '1.5', unit: 'cup' },
        { name: 'fresh basil', quantity: '2', unit: 'cup' },
        { name: 'garlic', quantity: '3', unit: 'cloves' },
        { name: 'pine nuts', quantity: '0.5', unit: 'cup' },
        { name: 'parmesan cheese', quantity: '0.5', unit: 'cup' },
        { name: 'extra virgin olive oil', quantity: '0.75', unit: 'cup' },
        { name: 'lemon', quantity: '1', unit: '' },
        { name: 'salt', quantity: '1', unit: 'tsp' },
        { name: 'black pepper', quantity: '0.5', unit: 'tsp' },
      ],
      steps: [
        { order: 1, title: 'Cook the farro', instruction: 'Rinse farro under cold water. Bring a large pot of salted water to boil, add farro, and cook for 30 minutes until tender but still chewy. Drain and set aside.' },
        { order: 2, title: 'Make the pesto', instruction: 'While farro cooks, roughly chop basil leaves and grate parmesan. Mince the garlic. In a food processor (or mortar and pestle for traditional), pulse basil, garlic, pine nuts, and a pinch of salt until coarsely chopped. With the motor running, drizzle in 0.5 cup of the olive oil in a thin stream until you have a chunky paste. Pulse in the parmesan and lemon juice from half the lemon. Taste and add salt and pepper. (Reserve the remaining 0.25 cup oil for cooking the chicken in step 3.)' },
        { order: 3, title: 'Season and cook chicken', instruction: 'If chicken breasts are thicker than 1 inch, butterfly them open or pound to even 1-inch thickness — uneven thickness leads to dry edges and raw centers. Pat dry and season both sides generously with salt and pepper. Heat the reserved 0.25 cup (4 tbsp) olive oil in a large skillet over medium-high heat. Cook chicken for 6-7 minutes per side until golden and internal temperature reaches 165°F. Transfer to a plate and let rest for 5 minutes, then slice into bite-sized pieces.' },
        { order: 4, title: 'Combine bowls', instruction: 'Divide warm farro between 4 bowls. Top each with sliced chicken and a generous dollop of pesto. Toss gently to combine, adding a squeeze of fresh lemon juice if desired.' },
      ],
    },
  },
];

const logLines = [];
function log(s) { console.log(s); logLines.push(s); }

async function applyOne(fix) {
  // 1. If we need to append ingredients, fetch the current list, append, and put it on update.ingredients
  if (fix.appendIngredients?.length) {
    const { data, error } = await sb.from('recipes').select('ingredients').eq('id', fix.id).single();
    if (error || !data) throw new Error(`fetch-ingredients failed: ${error?.message || 'no row'}`);
    const merged = [...(data.ingredients || []), ...fix.appendIngredients];
    fix.update.ingredients = merged;
  }
  if (DRY) return;
  const { error } = await sb.from('recipes').update(fix.update).eq('id', fix.id);
  if (error) throw error;
}

async function main() {
  log(`apply-recipe-fixes-202605 — mode: ${DRY ? 'DRY-RUN' : 'LIVE WRITE'}`);
  log(`recipes to update: ${FIXES.length}\n`);
  let ok = 0, fail = 0;
  for (let i = 0; i < FIXES.length; i++) {
    const fix = FIXES[i];
    const head = `[${i + 1}/${FIXES.length}] ${fix.title.padEnd(54).slice(0, 54)}`;
    process.stdout.write(head);
    try {
      await applyOne(fix);
      const fields = Object.keys(fix.update).join(', ') + (fix.appendIngredients ? ` (+${fix.appendIngredients.length} ing)` : '');
      log(` ${DRY ? '[would update]' : '✓'} ${fields}`);
      ok++;
    } catch (err) {
      log(` ✗ ${err.message.slice(0, 100)}`);
      fail++;
    }
  }
  log(`\n── Summary ──`);
  log(`  Updated: ${ok}`);
  log(`  Failed:  ${fail}`);
  if (DRY) log(`\n  (dry-run — nothing written)`);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(resolve(process.cwd(), `scripts/reports/apply-recipe-fixes-${ts}.log`), logLines.join('\n'));
  log(`  Log saved.`);
}

main().catch(err => { console.error(err); process.exit(1); });
