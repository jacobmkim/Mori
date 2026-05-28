import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

// In-app App Store / Play Store review prompt. Only fires on a positive
// moment (4-or-5 star post-cook review) so the rating distribution skews
// in our favour. Eligibility layered on top of Apple's built-in 3-per-year
// cap so we don't burn the quota on lukewarm users:
//
//   - User has cooked at least MIN_COOKS recipes
//   - Account is at least MIN_ACCOUNT_AGE_DAYS old
//   - We haven't asked them in the last COOLDOWN_DAYS
//
// Apple's SKStoreReviewController itself silently no-ops past 3 prompts a
// year, which is why we check our own AsyncStorage timestamp too — wasted
// no-ops still consume one of those three.

const STORAGE_KEY = 'mori_last_app_review_prompt_at_v1';

export const MIN_COOKS = 3;
export const MIN_ACCOUNT_AGE_DAYS = 7;
export const COOLDOWN_DAYS = 90;
export const MIN_STARS = 4;

interface EligibilityInput {
  rating: number;
  mealsCookedCount: number;
  accountCreatedAt: string | null;
  lastPromptIso: string | null;
  now?: number;
}

export function isEligible({
  rating,
  mealsCookedCount,
  accountCreatedAt,
  lastPromptIso,
  now = Date.now(),
}: EligibilityInput): boolean {
  if (rating < MIN_STARS) return false;
  if (mealsCookedCount < MIN_COOKS) return false;

  if (!accountCreatedAt) return false;
  const created = new Date(accountCreatedAt).getTime();
  if (!Number.isFinite(created)) return false;
  if (now - created < MIN_ACCOUNT_AGE_DAYS * 86400_000) return false;

  if (lastPromptIso) {
    const last = new Date(lastPromptIso).getTime();
    if (Number.isFinite(last) && now - last < COOLDOWN_DAYS * 86400_000) return false;
  }

  return true;
}

async function readLastPrompt(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeLastPrompt(iso: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, iso);
  } catch {}
}

interface MaybePromptOptions {
  rating: number;
  mealsCookedCount: number;
  accountCreatedAt: string | null;
}

// Called after a successful PostCookReviewModal submission. Returns true if
// the OS prompt was triggered (helpful for tests + analytics). Failures are
// swallowed — we never want a review prompt to break the post-cook flow.
export async function maybePromptForAppReview(opts: MaybePromptOptions): Promise<boolean> {
  const lastPromptIso = await readLastPrompt();
  if (!isEligible({ ...opts, lastPromptIso })) return false;

  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) return false;
    const hasAction = await StoreReview.hasAction();
    if (!hasAction) return false;

    await StoreReview.requestReview();
    // Persist BEFORE handing control back. Even if the user dismisses the OS
    // sheet immediately, we count this as "asked" so we honour the cooldown.
    await writeLastPrompt(new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}
