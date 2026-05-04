# Apple Reviewer Demo Account — Mori v1

Paste these into App Store Connect → your app → **App Review Information**.

## Demo account

| Field | Value |
|---|---|
| Email (`User Name` in ASC) | `apple-review@getmori.app` |
| Password | *paste from your password manager — never commit this file with the password filled in* |
| Display name | A-Tester |
| Username | @applereviewer |
| Sign-In Required | **Yes** |

The address routes to your personal Gmail via Cloudflare Email Routing
(`apple-review@getmori.app` → forward rule). The welcome-email verification
link has been tapped, so the unverified-email banner will not show during
review.

## Pre-seeded state

The account is populated with realistic activity so reviewers see a working
app on first sign-in (instead of an empty Discover deck — which would risk a
Guideline 4.2 "minimum functionality" rejection):

- Onboarding completed (balanced + high protein, italian/japanese/mexican,
  home cook, quick & simple, most days)
- 8+ saved recipes across multiple cuisines
- Pantry populated with 6+ staple items
- Taste profile generated (text + flavour DNA bars visible)
- One recipe marked as cooked → 1-day streak shows
- One day in Plan tab has a recipe assigned

**Do not touch this account again** until v1 is approved by Apple.
Apple may sign in multiple times during review and updates.

## Review Notes (paste verbatim into ASC → App Review Information → Notes)

```
Sign in with the demo account above.

Mori uses Supabase email/password authentication only — no third-party
social login providers, so Sign in with Apple is not required per
Guideline 4.8 (own auth system exemption).

Core flow walkthrough:
1. Discover tab — swipe right to save recipes, left to skip.
2. Recipes tab — saved recipes; tap to view detail; long-press to
   multi-select for delete.
3. Plan tab — weekly meal plan; tap a day slot to add a recipe.
4. Grocery List tab — tap "Send to Instacart" → opens a sandbox Instacart
   link in the system browser. The link generates a real cart preview
   but no purchase occurs in the sandbox environment.
5. Profile (avatar tap) — preferences, taste profile, badges, Help &
   Support, in-app account deletion at the bottom.

Mori uses Anthropic Claude (server-side via Vercel) for AI features:
taste profile generation, macro estimation, post-cook storage tips,
and recipe validation. See Privacy Policy section 4 for full disclosure.

In-app account deletion (per Guideline 5.1.1(v)):
Profile → scroll to bottom → Delete Account → password reauth → confirm.
This hard-deletes the auth user, profile, swipes, saves, plans, pantry,
notes, and reviews. Community recipes the user submitted are
de-attributed and retired.
```

## Account rotation

If you ever need to rotate the password (recommended every ~6 months or
after Apple review concludes):

1. Sign in to Mori as `apple-review@getmori.app`
2. Use the in-app password reset flow (or Supabase Studio → Authentication
   → click the user → Reset password)
3. Update the password in your password manager
4. Update App Store Connect → App Review Information → Password
