import { Share } from 'react-native';
import type { Recipe } from '@/types';

// Shared recipe-sharing helper used by the recipe detail modal (header icon +
// prominent button) and the post-cook "send to a friend" nudge, so the link
// format and the private-draft guard stay in one place.

type ShareableRecipe = Pick<Recipe, 'id' | 'supabase_id' | 'source_type' | 'is_public'>;

// Private community drafts would 404 on the public web page — don't offer to
// share those.
export function canShareRecipe(recipe: Pick<Recipe, 'source_type' | 'is_public'>): boolean {
  return !(recipe.source_type === 'community' && recipe.is_public === false);
}

export function recipeShareUrl(recipe: Pick<Recipe, 'id' | 'supabase_id'>): string {
  return `https://getmori.app/r/${recipe.supabase_id ?? recipe.id}`;
}

// Opens the system share sheet. The URL is embedded in `message` (not the
// separate `url` field) so iMessage unfurls it as a single preview bubble
// instead of attaching the link twice. Errors (incl. user cancel) are swallowed.
export function shareRecipe(recipe: ShareableRecipe): Promise<void> {
  return Share.share({
    message: `You should try this recipe on Mori\n\n${recipeShareUrl(recipe)}`,
  }).then(() => {}).catch(() => {});
}
