import { getRecipeImageUrl } from '@/lib/recipeImage';

const SUPABASE = 'https://gsqvhepgjzjwbezivfid.supabase.co';
const OBJECT_URL = `${SUPABASE}/storage/v1/object/public/recipe-images/generated/abc.png`;
const RENDER_URL = `${SUPABASE}/storage/v1/render/image/public/recipe-images/generated/abc.png?width=400&quality=70`;

describe('getRecipeImageUrl', () => {
  describe('null / empty inputs', () => {
    it('returns empty string for null', () => {
      expect(getRecipeImageUrl(null, 'card')).toBe('');
    });
    it('returns empty string for undefined', () => {
      expect(getRecipeImageUrl(undefined, 'card')).toBe('');
    });
    it('returns empty string for empty string', () => {
      expect(getRecipeImageUrl('', 'card')).toBe('');
    });
  });

  describe('Supabase Storage URLs', () => {
    it('swaps /object/public/ → /render/image/public/ and appends size params', () => {
      const out = getRecipeImageUrl(OBJECT_URL, 'card');
      expect(out).toContain('/storage/v1/render/image/public/');
      expect(out).not.toContain('/storage/v1/object/public/');
      expect(out).toContain('width=400');
      expect(out).toContain('quality=70');
    });

    it('honors each size preset', () => {
      expect(getRecipeImageUrl(OBJECT_URL, 'thumb')).toContain('width=160');
      expect(getRecipeImageUrl(OBJECT_URL, 'card')).toContain('width=400');
      expect(getRecipeImageUrl(OBJECT_URL, 'hero')).toContain('width=800');
      expect(getRecipeImageUrl(OBJECT_URL, 'detail')).toContain('width=1200');
    });

    it('is idempotent — re-transforming a render URL returns it unchanged', () => {
      expect(getRecipeImageUrl(RENDER_URL, 'card')).toBe(RENDER_URL);
    });

    it('uses & when the URL already has a query string', () => {
      const withQuery = `${OBJECT_URL}?t=12345`;
      const out = getRecipeImageUrl(withQuery, 'card');
      expect(out).toContain('?t=12345&width=400');
    });
  });

  describe('external URLs', () => {
    it('passes MealDB URLs through unchanged', () => {
      const mealdb = 'https://www.themealdb.com/images/media/meals/xrrwpx1487347049.jpg';
      expect(getRecipeImageUrl(mealdb, 'card')).toBe(mealdb);
    });

    it('passes arbitrary URLs through unchanged', () => {
      const random = 'https://example.com/photo.jpg';
      expect(getRecipeImageUrl(random, 'hero')).toBe(random);
    });
  });
});
