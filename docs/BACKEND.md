# Backend Notes

## Deterministic alternatives mode

AI-based alternative generation is intentionally disabled.

Current behavior in `alternative-suggest`:

1. Load deck meals for the current user/day.
2. Apply profile constraints as warning flags.
3. Rank alternatives by warning penalty and cook-time proximity.
4. Return top 3 alternatives.

## Safety behavior

Conflicting meals are allowed with warning flags instead of hard blocks.

## Required follow-up

Add the Supabase Swift SDK and implement actual session restoration and sign-in token handling in `ios/MealSwipe/Services/AuthService.swift`.
