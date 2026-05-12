import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Public web preview of a recipe at https://getmori.app/r/{id}
// — served by Vercel rewrite (`/r/:id` → `/api/recipe-page?id=:id`).
// Renders self-contained HTML with OG meta tags so shares unfurl nicely.
// Uses the anon key + the existing "Anyone can view recipes" RLS policy.
// Filters: is_public !== false. Private drafts return 404.

interface Ingredient { name: string; quantity?: string | null; unit?: string | null }
interface Step { order: number; instruction: string }
interface RecipeRow {
  id: string;
  title: string;
  description: string | null;
  cuisine: string | null;
  image_url: string | null;
  ingredients: Ingredient[] | null;
  steps: Step[] | null;
  prep_time_mins: number | null;
  cook_time_mins: number | null;
  servings: number | null;
  dietary_tags: string[] | null;
  macros: {
    calories?: number;
    protein?: number;
    carbohydrates?: number;
    fat?: number;
    fibre?: number;
    isEstimated?: boolean;
  } | null;
  is_public: boolean | null;
  save_count: number | null;
  cook_count: number | null;
  submitter: { name: string | null; username: string | null } | null;
}

const APP_STORE_URL = 'https://apps.apple.com/us/app/mori/id6743395988';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function notFound(res: VercelResponse) {
  res.status(404)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Recipe not found · Mori</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
           font-family: 'DM Sans', sans-serif; color: #1A1A1A; background: #F8F3EC; padding: 32px; text-align: center; }
    h1 { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 700; margin: 0 0 12px; font-size: 2rem; color: #2E5438; }
    p { max-width: 380px; color: #555; line-height: 1.5; }
    a { display: inline-block; margin-top: 24px; padding: 14px 24px; background: #2E5438; color: white;
        border-radius: 999px; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Recipe not found</h1>
  <p>This recipe may have been removed or kept private. Open Mori to discover thousands of others.</p>
  <a href="${APP_STORE_URL}">Get Mori</a>
</body>
</html>`);
}

function formatTotalTime(prep: number | null, cook: number | null): string | null {
  const total = (prep ?? 0) + (cook ?? 0);
  if (!total) return null;
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function renderIngredient(i: Ingredient): string {
  const qty = [i.quantity, i.unit].filter(Boolean).join(' ').trim();
  const name = escapeHtml(i.name ?? '');
  return qty ? `<li><span class="qty">${escapeHtml(qty)}</span> ${name}</li>` : `<li>${name}</li>`;
}

function renderRecipe(recipe: RecipeRow, origin: string): string {
  const title = escapeHtml(recipe.title);
  const description = recipe.description ? escapeHtml(recipe.description) : '';
  const totalTime = formatTotalTime(recipe.prep_time_mins, recipe.cook_time_mins);
  const url = `${origin}/r/${recipe.id}`;
  const ogImage = recipe.image_url ? escapeHtml(recipe.image_url) : '';
  const submitterLine = recipe.submitter?.username
    ? `By @${escapeHtml(recipe.submitter.username)} on Mori`
    : recipe.submitter?.name
      ? `By ${escapeHtml(recipe.submitter.name)} on Mori`
      : 'From Mori';

  const ingredientsHtml = (recipe.ingredients ?? [])
    .map(renderIngredient)
    .join('\n');
  const stepsHtml = (recipe.steps ?? [])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s, idx) => `<li><strong>${idx + 1}.</strong> ${escapeHtml(s.instruction ?? '')}</li>`)
    .join('\n');
  const tags = (recipe.dietary_tags ?? []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');

  const macros = recipe.macros;
  const macroRow = macros && (macros.calories || macros.protein) ? `
    <div class="macros">
      ${macros.calories ? `<div><b>${Math.round(macros.calories)}</b><span>cal</span></div>` : ''}
      ${macros.protein ? `<div><b>${Math.round(macros.protein)}g</b><span>protein</span></div>` : ''}
      ${macros.carbohydrates ? `<div><b>${Math.round(macros.carbohydrates)}g</b><span>carbs</span></div>` : ''}
      ${macros.fat ? `<div><b>${Math.round(macros.fat)}g</b><span>fat</span></div>` : ''}
    </div>
    ${macros.isEstimated ? '<div class="estimated">Macros estimated</div>' : ''}
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · Mori</title>
  <meta name="description" content="${description || title + ' — a recipe on Mori.'}" />

  <!-- Open Graph / Twitter -->
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description || 'Discover this recipe on Mori.'}" />
  ${ogImage ? `<meta property="og:image" content="${ogImage}" />` : ''}
  <meta property="og:url" content="${escapeHtml(url)}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Mori" />
  <meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}" />
  ${ogImage ? `<meta name="twitter:image" content="${ogImage}" />` : ''}

  <!-- iOS smart banner -->
  <meta name="apple-itunes-app" content="app-id=6743395988" />

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root { --green: #2E5438; --linen: #F8F3EC; --text: #1A1A1A; --muted: #6B6B6B; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'DM Sans', sans-serif; color: var(--text); background: var(--linen); line-height: 1.5; }
    header { position: sticky; top: 0; z-index: 10; background: rgba(248, 243, 236, 0.95); backdrop-filter: blur(6px);
             padding: 12px 20px; border-bottom: 1px solid rgba(0,0,0,0.06); font-family: 'Playfair Display', serif;
             font-style: italic; font-weight: 700; color: var(--green); }
    .hero { width: 100%; max-height: 50vh; aspect-ratio: 4/3; object-fit: cover; display: block; }
    main { max-width: 720px; margin: 0 auto; padding: 24px 20px 120px; }
    h1 { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 700; font-size: 2.2rem; margin: 0 0 6px; color: var(--green); }
    .submitter { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 16px; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 6px; }
    .meta span { font-size: 0.82rem; padding: 4px 10px; background: rgba(46, 84, 56, 0.08); color: var(--green); border-radius: 999px; }
    .tag { font-size: 0.78rem; padding: 3px 9px; background: white; color: var(--green); border: 1px solid rgba(46, 84, 56, 0.18); border-radius: 999px; margin: 0 6px 6px 0; display: inline-block; }
    .description { color: var(--muted); margin: 12px 0 18px; font-size: 0.95rem; }
    .macros { display: grid; grid-template-columns: repeat(auto-fit, minmax(72px, 1fr)); gap: 8px; padding: 14px; background: white; border-radius: 14px; margin: 16px 0 6px; }
    .macros div { text-align: center; }
    .macros b { display: block; font-size: 1.05rem; color: var(--text); font-weight: 700; }
    .macros span { font-size: 0.72rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .estimated { font-size: 0.72rem; color: var(--muted); margin: 4px 0 14px; font-style: italic; }
    h2 { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 700; color: var(--green); font-size: 1.4rem; margin: 28px 0 10px; }
    ul.ingredients, ol.steps { list-style: none; padding: 0; margin: 0; }
    ul.ingredients li { padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.06); font-size: 0.98rem; }
    ul.ingredients .qty { font-weight: 600; color: var(--green); margin-right: 4px; }
    ol.steps li { padding: 12px 0; border-bottom: 1px solid rgba(0,0,0,0.06); font-size: 0.98rem; line-height: 1.6; }
    ol.steps li strong { color: var(--green); margin-right: 6px; font-family: 'Playfair Display', serif; font-style: italic; }
    .cta-bar { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(248, 243, 236, 0.97);
               backdrop-filter: blur(8px); padding: 14px 20px calc(14px + env(safe-area-inset-bottom)); border-top: 1px solid rgba(0,0,0,0.06);
               display: flex; gap: 10px; max-width: 720px; margin: 0 auto; }
    .cta-bar a { flex: 1; text-align: center; padding: 14px 16px; border-radius: 14px; font-weight: 700; text-decoration: none; font-size: 0.98rem; }
    .cta-primary { background: var(--green); color: white; }
    .cta-secondary { background: white; color: var(--green); border: 1px solid rgba(46, 84, 56, 0.2); }
    @media (max-width: 480px) { h1 { font-size: 1.8rem; } main { padding-bottom: 140px; } }
  </style>
</head>
<body>
  <header>Mori</header>
  ${recipe.image_url ? `<img class="hero" src="${ogImage}" alt="${title}" />` : ''}
  <main>
    <h1>${title}</h1>
    <div class="submitter">${submitterLine}</div>
    <div class="meta">
      ${totalTime ? `<span>⏱ ${totalTime}</span>` : ''}
      ${recipe.servings ? `<span>🍽 ${recipe.servings} servings</span>` : ''}
      ${recipe.cuisine ? `<span>${escapeHtml(recipe.cuisine)}</span>` : ''}
      ${(recipe.save_count ?? 0) > 0 ? `<span>❤ ${recipe.save_count} saved</span>` : ''}
      ${(recipe.cook_count ?? 0) > 0 ? `<span>🍳 ${recipe.cook_count} cooked</span>` : ''}
    </div>
    ${tags ? `<div>${tags}</div>` : ''}
    ${description ? `<p class="description">${description}</p>` : ''}
    ${macroRow}
    <h2>Ingredients</h2>
    <ul class="ingredients">${ingredientsHtml || '<li>No ingredients listed.</li>'}</ul>
    <h2>Steps</h2>
    <ol class="steps">${stepsHtml || '<li>No steps listed.</li>'}</ol>
  </main>
  <div class="cta-bar">
    <a class="cta-primary" href="mori://r/${encodeURIComponent(recipe.id)}">Open in Mori</a>
    <a class="cta-secondary" href="${APP_STORE_URL}">Get the app</a>
  </div>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return notFound(res);
  }

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send('<h1>Server misconfigured</h1>');
    return;
  }

  const sb = createClient(url, anonKey);
  const { data, error } = await sb
    .from('recipes')
    .select('id, title, description, cuisine, image_url, ingredients, steps, prep_time_mins, cook_time_mins, servings, dietary_tags, macros, is_public, save_count, cook_count, submitter:profiles_public!recipes_submitted_by_fkey(name, username)')
    .eq('id', id)
    .single();

  if (error || !data || data.is_public === false) {
    return notFound(res);
  }

  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'getmori.app';
  const origin = `${proto}://${host}`;

  res.status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400')
    .send(renderRecipe(data as unknown as RecipeRow, origin));
}
