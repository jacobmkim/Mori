# Mise

Smart recipe discovery and grocery delivery app powered by Claude AI.

---

## Prerequisites

- Node.js 18+
- npm
- Expo Go app on your iPhone (iOS first)
- A Supabase account
- A Vercel account (for AI/macro endpoints)

---

## 1. Clone and Install

```bash
git clone <repo-url>
cd ProjectX
npm install --legacy-peer-deps
```

> Always use `--legacy-peer-deps` — required due to peer dependency conflicts with Expo SDK 54.

---

## 2. Environment Variables

Create a `.env` file in the project root:

```bash
# Supabase — safe to use in client code (EXPO_PUBLIC_ prefix)
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Vercel API base URL (for macros, recommendations)
EXPO_PUBLIC_API_URL=https://your-vercel-app.vercel.app

# Server-side only — never in client code
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-anthropic-key
SPOONACULAR_API_KEY=your-spoonacular-key
```

**Where to find these:**
- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase dashboard → Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — same page, under "Service Role" (keep secret)
- `EXPO_PUBLIC_API_URL` — your Vercel project dashboard after deploying

---

## 3. Supabase Setup

### Apply the schema

Go to your Supabase dashboard → SQL Editor → paste the contents of `supabase/schema.sql` → Run.

This creates all tables, RLS policies, indexes, and the auto-profile trigger.

### Verify it worked

Run these in the SQL Editor:

```sql
-- Should show all tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- Should show RLS enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
```

---

## 4. Seed the Database

Run these scripts once after applying the schema. They use the service role key from `.env`.

### Seed recipes + cohort affinities (419 recipes, ~249k affinity rows)

```bash
node scripts/seed-recipes.mjs
```

Output: `Done. 419 recipes, 248886 affinity rows inserted.`

### Backfill recipe ingredients and descriptions

```bash
node scripts/backfill-recipe-details.mjs
```

Fetches full ingredient lists from TheMealDB for all seeded recipes. Takes ~60 seconds. Safe to re-run — skips recipes already populated.

Output: `Done. 419 updated, 0 failed.`

---

## 5. Vercel Deployment

### Install Vercel CLI

```bash
npm install -g vercel
```

### Deploy

```bash
vercel
```

Follow the prompts. When asked about environment variables, add:

```
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
SPOONACULAR_API_KEY
EXPO_PUBLIC_SUPABASE_URL   (also needed server-side)
```

Or add them in the Vercel dashboard → Project → Settings → Environment Variables.

### Production deploy

```bash
vercel --prod
```

Copy the deployment URL into your `.env` as `EXPO_PUBLIC_API_URL`.

---

## 6. Run the App

```bash
npx expo start
```

Then:
- Press `i` to open in iOS Simulator (requires Xcode)
- Or scan the QR code with the **Expo Go** app on your iPhone

### Useful flags

```bash
npx expo start --clear        # Clear Metro bundler cache (fixes most weird errors)
npx expo start --tunnel       # Use tunnel if local network won't connect
```

---

## 7. Project Structure

```
mise/
├── app/                    # Expo Router screens
│   ├── _layout.tsx         # Root layout + session check
│   ├── index.tsx           # Auth redirect
│   ├── onboarding/         # 10-screen onboarding flow
│   └── (tabs)/             # Main tab screens
│       ├── discover.tsx    # Swipe deck
│       ├── recipes.tsx     # Saved recipe grid
│       ├── grocery-list.tsx
│       └── profile.tsx
├── components/
│   ├── RecipeDetailModal.tsx
│   └── ui/
│       ├── MacroRow.tsx
│       └── MiseLogo.tsx
├── lib/
│   ├── api.ts              # All Supabase calls — use this, never call Supabase directly from screens
│   ├── mealdb.ts           # TheMealDB helpers
│   ├── supabase.ts         # Supabase client
│   └── utils.ts
├── stores/                 # Zustand state
│   ├── userStore.ts
│   ├── savedStore.ts
│   ├── groceryStore.ts
│   └── collectionsStore.ts
├── constants/theme.ts      # All colors — never hardcode hex values
├── types/index.ts          # All TypeScript types
├── scripts/
│   ├── seed-recipes.mjs            # One-time recipe seed
│   └── backfill-recipe-details.mjs # One-time ingredient backfill
├── api/                    # Vercel serverless functions
│   ├── macros.ts           # Spoonacular → Claude estimate → local fallback
│   └── seed-recipes.ts     # HTTP endpoint version of seed script
└── supabase/
    └── schema.sql          # Full DB schema — apply this first
```

---

## 8. Key Rules

| Rule | Why |
|---|---|
| Always `npm install --legacy-peer-deps` | Expo SDK 54 peer dep conflicts |
| All Supabase calls go through `lib/api.ts` | Never call Supabase directly from screens |
| All AI/Spoonacular/Instacart calls via Vercel functions | Never expose secret keys on client |
| Inline styles + `constants/theme.ts` | NativeWind is installed but not used |
| React Native Animated API | Do not migrate to Reanimated |
| `EXPO_PUBLIC_` prefix | Only these vars are safe on the client |

---

## 9. Common Issues

**"Metro bundler errors / stale cache"**
```bash
npx expo start --clear
```

**"Cannot find module" after installing a package**
```bash
npm install --legacy-peer-deps
npx expo start --clear
```

**"Profile not loading / showing Mise User"**
The profile row may be missing. Sign out, sign back in — `index.tsx` auto-creates a minimal profile row if none exists.

**"Recipes not filtering by dietary goals"**
The in-memory deck cache may be stale. Go to Profile → Edit Preferences → Save (even without changes) to clear the cache and reload.

**Spoonacular rate limit hit**
Free tier is 150 points/day. Macro pills fall back to local keyword estimates automatically — the app still works, just with estimated values labelled as such.

---

## 10. Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Production-ready, merged after each phase is tested |
| `feat/phase-1-foundation` | ✅ Complete — merged to main |
| `feat/phase-2-ai-layer` | Current development branch |

Merge to main only after full testing of the phase:

```bash
git checkout main
git merge feat/phase-2-ai-layer --no-ff -m "Merge Phase 2"
git push origin main
```
