// Rewrites a Supabase Storage public URL to use Image Transformations so the
// app downloads a right-sized WebP instead of the multi-megabyte gpt-image-1
// original. Returns external URLs (MealDB, etc.) unchanged.
//
// Why this exists: the `recipe-images` bucket was uploaded with `Cache-Control:
// no-cache` AND no resizing, so every card pulled ~1.5 MB and re-validated on
// every render. The /render/image/public/ endpoint serves resized WebPs with
// `Cache-Control: max-age=3600`, fixing both problems with a URL swap. Sampling
// a typical recipe (Lamb Tzatziki Burgers PNG): 1.59 MB → 29 KB at w=400/q=70
// when the client sends `Accept: image/webp` (expo-image does on iOS).

const SUPABASE_OBJECT = '/storage/v1/object/public/';
const SUPABASE_RENDER = '/storage/v1/render/image/public/';

export type RecipeImageSize = 'thumb' | 'card' | 'hero' | 'detail';

const PRESETS: Record<RecipeImageSize, { width: number; quality: number }> = {
  thumb:  { width: 160, quality: 70 },  // 44–60 px square avatars / mini thumbs
  card:   { width: 400, quality: 70 },  // grid + horizontal cards (≤140 px wide)
  hero:   { width: 800, quality: 75 },  // swipe deck card (full screen width)
  detail: { width: 1200, quality: 80 }, // recipe detail modal header
};

export function getRecipeImageUrl(url: string | null | undefined, size: RecipeImageSize): string {
  if (!url) return '';
  // Idempotent: already transformed → return as-is.
  if (url.includes(SUPABASE_RENDER)) return url;
  // External (MealDB, hand-curated, etc.) — Image Transformations are a
  // Supabase Storage feature, so we can't resize these. Leave them alone.
  if (!url.includes(SUPABASE_OBJECT)) return url;

  const transformed = url.replace(SUPABASE_OBJECT, SUPABASE_RENDER);
  const { width, quality } = PRESETS[size];
  const separator = transformed.includes('?') ? '&' : '?';
  return `${transformed}${separator}width=${width}&quality=${quality}`;
}
