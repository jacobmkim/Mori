import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Public web preview of a recipe at https://getmori.app/r/{id}
// — served by Vercel rewrite (`/r/:id` → `/api/recipe-page?id=:id`).
// Renders self-contained HTML with OG meta tags so shares unfurl nicely.
// Uses the anon key + the existing "Anyone can view recipes" RLS policy.
// Filters: is_public !== false. Private drafts return 404.
//
// Steps are deliberately omitted — recipients are nudged to "Open in Mori"
// to see the cooking flow. Ingredients + macros + reviews give enough to
// decide whether to save it.

interface Ingredient { name: string; quantity?: string | null; unit?: string | null }
interface RecipeRow {
  id: string;
  title: string;
  description: string | null;
  cuisine: string | null;
  image_url: string | null;
  ingredients: Ingredient[] | null;
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
  avg_rating: number | null;
  rating_count: number | null;
  submitter: { name: string | null; username: string | null } | null;
}

interface ReviewRow {
  rating: number;
  review_text: string | null;
  created_at: string;
  reviewer: { name: string | null; username: string | null; avatar_url: string | null } | null;
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
    img.logo { height: 36px; margin-bottom: 28px; }
    h1 { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 700; margin: 0 0 12px; font-size: 2rem; color: #2E5438; }
    p { max-width: 380px; color: #555; line-height: 1.5; }
    a { display: inline-block; margin-top: 24px; padding: 14px 24px; background: #2E5438; color: white;
        border-radius: 999px; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <img class="logo" src="/mori-green.png" alt="Mori" />
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
  return qty
    ? `<li><span class="ing-name">${name}</span><span class="ing-qty">${escapeHtml(qty)}</span></li>`
    : `<li><span class="ing-name">${name}</span></li>`;
}

function tagLabel(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderStars(rating: number): string {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += i <= Math.round(rating)
      ? '<span class="star filled">★</span>'
      : '<span class="star">☆</span>';
  }
  return html;
}

function renderReview(r: ReviewRow): string {
  const name = r.reviewer?.username
    ? `@${escapeHtml(r.reviewer.username)}`
    : r.reviewer?.name
      ? escapeHtml(r.reviewer.name)
      : 'Mori user';
  const initials = r.reviewer?.name
    ? r.reviewer.name.split(' ').map((p) => p[0] ?? '').join('').toUpperCase().slice(0, 2)
    : '?';
  const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const avatar = r.reviewer?.avatar_url
    ? `<img class="review-avatar-img" src="${escapeHtml(r.reviewer.avatar_url)}" alt="" />`
    : `<span class="review-avatar-initials">${escapeHtml(initials)}</span>`;
  const text = r.review_text ? `<p class="review-text">${escapeHtml(r.review_text)}</p>` : '';
  return `<div class="review">
    <div class="review-head">
      <div class="review-avatar">${avatar}</div>
      <div class="review-meta">
        <div class="review-name">${name}</div>
        <div class="review-date">${date}</div>
      </div>
      <div class="review-stars">${renderStars(r.rating)}</div>
    </div>
    ${text}
  </div>`;
}

function renderRecipe(recipe: RecipeRow, reviews: ReviewRow[], origin: string): string {
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

  const cuisinePills = (recipe.cuisine ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => c.charAt(0).toUpperCase() + c.slice(1));
  const isFusion = cuisinePills.length > 1;
  const metaPills = [
    ...cuisinePills,
    ...(isFusion ? ['Fusion'] : []),
    totalTime,
    recipe.servings ? `${recipe.servings} serving${recipe.servings !== 1 ? 's' : ''}` : null,
  ].filter(Boolean) as string[];

  const dietaryTagsHtml = (recipe.dietary_tags ?? [])
    .map((t) => `<span class="dietary-tag">${escapeHtml(tagLabel(t))}</span>`)
    .join('');

  const macros = recipe.macros;
  const macroRow = macros && (macros.calories || macros.protein) ? `
    <div class="macros">
      ${macros.calories ? `<div><b>${Math.round(macros.calories)}</b><span>cal</span></div>` : ''}
      ${macros.protein ? `<div><b>${Math.round(macros.protein)}g</b><span>protein</span></div>` : ''}
      ${macros.carbohydrates ? `<div><b>${Math.round(macros.carbohydrates)}g</b><span>carbs</span></div>` : ''}
      ${macros.fat ? `<div><b>${Math.round(macros.fat)}g</b><span>fat</span></div>` : ''}
      ${macros.fibre ? `<div><b>${Math.round(macros.fibre)}g</b><span>fibre</span></div>` : ''}
    </div>
    ${macros.isEstimated ? '<div class="estimated">Estimated · per serving</div>' : ''}
  ` : '';

  const ratingCount = recipe.rating_count ?? 0;
  const avgRating = Number(recipe.avg_rating ?? 0);
  const ratingPill = ratingCount >= 3 ? `
    <div class="rating-summary">
      <span class="star filled">★</span>
      <span class="rating-value">${avgRating.toFixed(1)}</span>
      <span class="rating-count">· ${ratingCount} ${ratingCount === 1 ? 'review' : 'reviews'}</span>
    </div>
  ` : '';

  const reviewsHtml = reviews.length > 0
    ? `<section class="section">
        <h2>Reviews</h2>
        <div class="reviews">${reviews.map(renderReview).join('')}</div>
      </section>`
    : '';

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
    :root {
      --green: #2E5438;
      --linen: #F8F3EC;
      --text: #1A1A1A;
      --muted: #6B6B6B;
      --pill: rgba(224, 224, 224, 0.4);
      --pill-text: #6B6B6B;
      --border: rgba(0, 0, 0, 0.06);
      --star: #FFC107;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'DM Sans', sans-serif;
      color: var(--text);
      background: var(--linen);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    header {
      position: sticky; top: 0; z-index: 10;
      background: rgba(248, 243, 236, 0.95);
      backdrop-filter: blur(8px);
      padding: 10px 20px;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center;
    }
    header img.logo { height: 24px; width: auto; }
    .hero { width: 100%; max-height: 50vh; aspect-ratio: 4/3; object-fit: cover; display: block; }
    main { max-width: 720px; margin: 0 auto; padding: 20px 18px 130px; }
    h1 {
      font-family: Georgia, serif;
      font-style: italic;
      font-weight: 400;
      font-size: 1.8rem;
      margin: 0 0 8px;
      color: var(--text);
      line-height: 1.25;
    }
    .submitter {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--muted);
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .submitter::before {
      content: "";
      width: 14px; height: 14px;
      background: var(--green);
      mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'><path d='M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z'/></svg>");
      mask-repeat: no-repeat;
      mask-position: center;
      mask-size: contain;
      flex-shrink: 0;
    }
    .meta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
    .meta .pill {
      font-size: 0.75rem;
      padding: 6px 12px;
      background: var(--pill);
      color: var(--pill-text);
      border-radius: 8px;
      font-weight: 400;
    }
    .rating-summary {
      display: inline-flex; align-items: center; gap: 6px;
      margin-bottom: 14px;
      font-size: 0.85rem;
    }
    .rating-summary .rating-value { color: var(--text); font-weight: 600; }
    .rating-summary .rating-count { color: var(--muted); font-size: 0.8rem; }
    .description { color: var(--muted); margin: 0 0 18px; font-size: 0.93rem; }
    .dietary-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px; }
    .dietary-tag {
      font-size: 0.72rem;
      padding: 5px 10px;
      background: white;
      color: var(--green);
      border: 1px solid rgba(46, 84, 56, 0.2);
      border-radius: 999px;
      font-weight: 500;
    }
    .stats {
      display: flex; gap: 16px;
      padding: 12px 14px;
      background: white;
      border-radius: 14px;
      margin-bottom: 14px;
      font-size: 0.8rem;
      color: var(--muted);
    }
    .stats .stat { display: flex; align-items: center; gap: 5px; }
    .stats .stat b { color: var(--text); font-weight: 700; }
    .macros {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
      gap: 6px;
      padding: 14px;
      background: white;
      border-radius: 14px;
      margin: 0 0 4px;
    }
    .macros div { text-align: center; }
    .macros b { display: block; font-size: 1.05rem; color: var(--text); font-weight: 700; line-height: 1.2; }
    .macros span { font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .estimated { font-size: 0.7rem; color: var(--muted); margin: 6px 2px 18px; font-style: italic; text-align: center; }
    .section { margin-top: 28px; }
    h2 {
      font-family: Georgia, serif;
      font-style: italic;
      font-weight: 700;
      color: var(--text);
      font-size: 1.15rem;
      margin: 0 0 12px;
    }
    ul.ingredients { list-style: none; padding: 0; margin: 0; background: white; border-radius: 14px; padding: 4px 14px; }
    ul.ingredients li {
      display: flex; justify-content: space-between; align-items: center;
      padding: 11px 0;
      border-bottom: 1px solid var(--border);
      font-size: 0.94rem;
    }
    ul.ingredients li:last-child { border-bottom: none; }
    ul.ingredients .ing-name { color: var(--text); }
    ul.ingredients .ing-qty { color: var(--muted); font-size: 0.85rem; }
    .reviews { background: white; border-radius: 14px; padding: 0 16px; }
    .review { padding: 14px 0; border-bottom: 1px solid var(--border); }
    .review:last-child { border-bottom: none; }
    .review-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .review-avatar {
      width: 32px; height: 32px; border-radius: 50%;
      background: var(--green);
      display: flex; align-items: center; justify-content: center;
      overflow: hidden; flex-shrink: 0;
    }
    .review-avatar-img { width: 32px; height: 32px; object-fit: cover; }
    .review-avatar-initials { color: white; font-size: 0.7rem; font-weight: 700; }
    .review-meta { flex: 1; min-width: 0; }
    .review-name { font-size: 0.82rem; font-weight: 600; color: var(--text); }
    .review-date { font-size: 0.7rem; color: var(--muted); }
    .review-stars { white-space: nowrap; font-size: 0.85rem; }
    .review-text { margin: 0; font-size: 0.88rem; color: var(--text); line-height: 1.5; }
    .star { color: rgba(0, 0, 0, 0.18); }
    .star.filled { color: var(--star); }
    .cta-bar {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: rgba(248, 243, 236, 0.97);
      backdrop-filter: blur(8px);
      padding: 12px 18px calc(12px + env(safe-area-inset-bottom));
      border-top: 1px solid var(--border);
      display: flex; gap: 10px;
    }
    .cta-bar-inner { display: flex; gap: 10px; max-width: 720px; margin: 0 auto; width: 100%; }
    .cta-bar a {
      flex: 1; text-align: center;
      padding: 16px 16px;
      border-radius: 14px;
      font-weight: 700;
      text-decoration: none;
      font-size: 1rem;
      letter-spacing: 0.01em;
    }
    .cta-primary { background: var(--green); color: white; }
    @media (max-width: 480px) {
      h1 { font-size: 1.55rem; }
      main { padding-bottom: 140px; }
    }
  </style>
</head>
<body>
  <header><img class="logo" src="/mori-green.png" alt="Mori" /></header>
  ${recipe.image_url ? `<img class="hero" src="${ogImage}" alt="${title}" />` : ''}
  <main>
    <h1>${title}</h1>
    <div class="submitter">${submitterLine}</div>
    ${ratingPill}
    <div class="meta">
      ${metaPills.map((p) => `<span class="pill">${escapeHtml(p)}</span>`).join('')}
    </div>
    ${dietaryTagsHtml ? `<div class="dietary-tags">${dietaryTagsHtml}</div>` : ''}
    ${description ? `<p class="description">${description}</p>` : ''}
    ${((recipe.save_count ?? 0) > 0 || (recipe.cook_count ?? 0) > 0) ? `
      <div class="stats">
        ${(recipe.save_count ?? 0) > 0 ? `<div class="stat">❤ <b>${recipe.save_count}</b> saved</div>` : ''}
        ${(recipe.cook_count ?? 0) > 0 ? `<div class="stat">🍳 <b>${recipe.cook_count}</b> cooked</div>` : ''}
      </div>
    ` : ''}
    ${macroRow}
    <section class="section">
      <h2>Ingredients</h2>
      <ul class="ingredients">${ingredientsHtml || '<li>No ingredients listed.</li>'}</ul>
    </section>
    ${reviewsHtml}
  </main>
  <div class="cta-bar">
    <div class="cta-bar-inner">
      <a class="cta-primary" id="open-in-mori" href="mori://r/${encodeURIComponent(recipe.id)}">Open in Mori</a>
    </div>
  </div>
  <script>
    // Smart launcher: try the mori:// scheme; if the app isn't installed and
    // iOS keeps us on this page, fall through to the App Store. The
    // visibilityState check is the standard "did the app open?" tell — when
    // the OS hands control to the app the tab goes hidden.
    (function () {
      var APP_STORE_URL = ${JSON.stringify(APP_STORE_URL)};
      var DEEP_LINK = 'mori://r/' + ${JSON.stringify(recipe.id)};
      var btn = document.getElementById('open-in-mori');
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var start = Date.now();
        // Use location.href so back-button history stays clean.
        window.location.href = DEEP_LINK;
        // 1500ms is enough for the OS to swap apps. If we're still here
        // and visible, the scheme didn't resolve to anything — go to the store.
        setTimeout(function () {
          if (document.visibilityState === 'visible' && Date.now() - start < 3000) {
            window.location.href = APP_STORE_URL;
          }
        }, 1500);
      });
    })();
  </script>
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

  // Fetch recipe + top reviews in parallel. Reviews are a separate query so
  // a missing/empty reviews list doesn't 404 the page.
  const [recipeRes, reviewsRes] = await Promise.all([
    sb
      .from('recipes')
      .select('id, title, description, cuisine, image_url, ingredients, prep_time_mins, cook_time_mins, servings, dietary_tags, macros, is_public, save_count, cook_count, avg_rating, rating_count, submitter:profiles_public!recipes_submitted_by_fkey(name, username)')
      .eq('id', id)
      .single(),
    sb
      .from('recipe_reviews')
      .select('rating, review_text, created_at, reviewer:profiles_public!recipe_reviews_user_id_fkey(name, username, avatar_url)')
      .eq('recipe_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  if (recipeRes.error || !recipeRes.data || recipeRes.data.is_public === false) {
    return notFound(res);
  }

  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'getmori.app';
  const origin = `${proto}://${host}`;

  res.status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400')
    .send(renderRecipe(
      recipeRes.data as unknown as RecipeRow,
      (reviewsRes.data ?? []) as unknown as ReviewRow[],
      origin,
    ));
}
