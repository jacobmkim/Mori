# MealSwipe

MealSwipe is an iOS SwiftUI app plus Supabase backend for daily swipe-based meal selection.

## Current implementation status

- iOS app flow: auth screen, onboarding, swipe deck, alternatives sheet, result + shopping list, reminder settings.
- Supabase schema: profile, meal catalog, decks, swipes, daily results, shopping lists, reminders, AI log tables.
- Supabase Edge Functions:
  - `profile-upsert`
  - `deck-generate`
  - `swipe-record`
  - `alternative-suggest`
  - `day-result`
  - `shopping-list-build`
  - `reminder-set-time`
- Alternatives engine mode: **rule-based only** (AI disabled by request).

## Prerequisites

- Supabase CLI
- Xcode 15+
- XcodeGen (`brew install xcodegen`)

## Backend setup

1. Create a Supabase project.
2. Set project link and secrets:

```bash
supabase link --project-ref <project_ref>
supabase secrets set SPOONACULAR_API_KEY=<key>
```

3. Push schema:

```bash
supabase db push
```

4. Deploy functions:

```bash
supabase functions deploy profile-upsert
supabase functions deploy deck-generate
supabase functions deploy swipe-record
supabase functions deploy alternative-suggest
supabase functions deploy day-result
supabase functions deploy shopping-list-build
supabase functions deploy reminder-set-time
```

## iOS setup

1. Update `ios/MealSwipe/Services/APIClient.swift` with your Supabase Functions base URL.
2. Generate Xcode project:

```bash
cd ios
xcodegen generate
```

3. Open `MealSwipe.xcodeproj`, set signing/team, and run on simulator.

## Notes

- Auth service currently uses placeholders. Replace with Supabase Swift Auth SDK integration.
- `alternative-suggest` writes generation logs with model `rule-only`.
- You can enable OpenAI later by adding a separate AI module and toggling `aiEnabled` in `supabase/functions/_shared/alternatives.ts`.
