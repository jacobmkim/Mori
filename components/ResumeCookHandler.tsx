/**
 * ResumeCookHandler — top-level orchestrator that restores a cooking session
 * after the user backgrounds Mori (or kills it cold) mid-cook.
 *
 * Reads `useActiveCookStore`. If a fresh session exists (lastTickAt within
 * ACTIVE_COOK_STALE_MS), fetches the recipe and renders a RecipeDetailModal
 * pre-opened into CookingMode at the saved step. Stale sessions are cleared.
 *
 * Mount this once at the root of the app (app/_layout.tsx).
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useActiveCookStore, isActiveCookStale } from '@/stores/activeCookStore';
import { getRecipeById } from '@/lib/api';
import { RecipeDetailModal } from '@/components/RecipeDetailModal';
import type { Recipe } from '@/types';

export function ResumeCookHandler() {
  const recipeId = useActiveCookStore((s) => s.recipeId);
  const stepIndex = useActiveCookStore((s) => s.stepIndex);
  const lastTickAt = useActiveCookStore((s) => s.lastTickAt);
  const endCook = useActiveCookStore((s) => s.endCook);

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [visible, setVisible] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  // Staleness check — runs on mount, on store changes, and on every foreground
  // (warm app where the store value in memory didn't tick while backgrounded).
  useEffect(() => {
    function evaluate() {
      if (!recipeId) {
        setVisible(false);
        setRecipe(null);
        setHasShown(false);
        return;
      }
      if (isActiveCookStale(lastTickAt)) {
        endCook();
        return;
      }
      if (hasShown) return;
      // Fresh session and we haven't shown the modal yet — fetch + open.
      let cancelled = false;
      getRecipeById(recipeId)
        .then((r) => {
          if (cancelled || !r) {
            if (!r) endCook(); // recipe deleted or inaccessible — clear stale pointer
            return;
          }
          setRecipe(r);
          setVisible(true);
          setHasShown(true);
        })
        .catch(() => { /* network blip — try again on next foreground */ });
      return () => { cancelled = true; };
    }

    evaluate();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') evaluate();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, lastTickAt, hasShown]);

  function handleClose() {
    setVisible(false);
    // CookingMode itself calls endCook on its close path; if the user closes
    // the outer modal without entering CookingMode (edge case), still clear.
    endCook();
  }

  if (!visible || !recipe) return null;

  return (
    <RecipeDetailModal
      visible={visible}
      recipe={recipe}
      detail={null}
      isSaved={false}
      isInCart={false}
      onClose={handleClose}
      onSaveToggle={() => {}}
      onAddToCart={() => {}}
      autoOpenCookingAtStep={stepIndex}
    />
  );
}
