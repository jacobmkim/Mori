// Pure helpers for the win-back / dormancy re-engagement cron. Kept free of
// Supabase/network so they're unit-testable.

// Decides which win-back nudge (if any) to send given the user's current stage,
// how long they've been inactive, and how long since the last nudge.
//   stage 0 + inactive >= 7d              -> 1 (first nudge)
//   stage 1 + inactive >= 14d + spaced    -> 2 (second nudge)
//   otherwise                              -> null (skip; stage >= 2 = gave up)
export function nextWinbackStage(
  currentStage: number,
  daysInactive: number,
  daysSinceLastReminder: number | null,
): 1 | 2 | null {
  if (currentStage <= 0) {
    return daysInactive >= 7 ? 1 : null;
  }
  if (currentStage === 1) {
    const spaced = daysSinceLastReminder === null || daysSinceLastReminder >= 6;
    return daysInactive >= 14 && spaced ? 2 : null;
  }
  return null;
}

export interface SavedCandidate {
  recipe_id: string;
  title: string;
  cuisine: string | null;
  saved_at: string;
  cooked: boolean;
}

export interface RecipePick {
  recipe_id: string;
  title: string;
  cuisine: string | null;
}

// Picks the recipe to feature in the nudge: the user's most-recently-saved
// recipe they haven't cooked yet; failing that, a cuisine-matched fallback.
// Returns null when there's nothing personalized to surface (caller sends a
// generic nudge).
export function pickWinbackRecipe(
  saved: SavedCandidate[],
  cuisineFallback: RecipePick[],
): RecipePick | null {
  const freshest = saved
    .filter((s) => !s.cooked)
    .sort((a, b) => b.saved_at.localeCompare(a.saved_at))[0];
  if (freshest) {
    return { recipe_id: freshest.recipe_id, title: freshest.title, cuisine: freshest.cuisine };
  }
  return cuisineFallback[0] ?? null;
}
