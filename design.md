# Mori — design.md

## What Mori Is

Swipe-based recipe discovery app. Users swipe on recipe cards → save to library → build a grocery list → send to Instacart. iOS only.

**The one-liner:** Tinder for recipes. Swipe, save, send to Instacart.

**The name:** Mori (森) — Japanese for forest. Everything leans into this. Organic, natural, calm, considered. Not a loud productivity app. Not a diet tracker. A quiet forest of food you'll actually want to cook.

**What Mori is not:** A calorie counter. A diet app. A delivery app. A meal kit service. Android. Web.

---

## Approved Feature Language

Use these exact framings in all marketing content. Do not overclaim.

| Feature | ✅ Say this | ❌ Not this |
|---|---|---|
| Recipe discovery | "Swipe to discover recipes picked for your taste" | "AI recommends recipes" |
| Taste profile | "Mori builds your taste profile as you swipe" | "AI figures out your personality" |
| Grocery list | "Builds your grocery list automatically" | "Orders your groceries" |
| Instacart | "Sends your list to Instacart in one tap" | "Delivers groceries to your door" |
| Instacart | "One tap to Instacart" | "Groceries arrive in an hour" |
| Meal planning | "Drag recipes into your weekly meal grid" | "Plans your meals for you" |
| Recipe library | "1,500+ curated recipes" | "Infinite recipes" |
| Cooking mode | "Step-by-step cooking mode" | "Guided cooking AI" |
| Macros | "Estimated macros on every recipe" | "Precise nutrition tracking" |

> **Instacart note:** Mori generates an Instacart link. The user completes the order inside the Instacart app or browser. Mori does not place the order directly. Always frame as "sends to Instacart" or "one tap to Instacart."

---

## Brand Identity

**Bundle ID:** app.getmori.mori  
**Website:** getmori.app  
**Email:** hello@getmori.app  
**App Store:** iOS only

### The Aesthetic
Forest. Organic. Calm. Editorial. Not techy, not clinical, not aggressive. Think: a beautifully designed cookbook that happens to be an app. Georgia serif for anything expressive. Clean whitespace. Linen and moss as the soul of the palette.

---

## Logo

Three variants. PNG only — never recreate as SVG or inline code.

| File | Use case |
|---|---|
| `assets/mori-green.png` | Light mode app UI. Website nav + footer. Light backgrounds. |
| `assets/mori-dark.png` | Dark mode app UI. Dark backgrounds. |
| `assets/mori-white.png` | Welcome overlays. Any dark photo background. TikTok dark-bg slides. |
| `assets/mori_icon.png` | App Store icon. Favicon. Badge icons (32/40/48px). |

**Icon description:** Italic lowercase "m" + spatula. Linen background (#F8F3EC). Moss mark (#2E5438). 1024×1024px. Never changes between light/dark — always linen bg.

**Logo display sizes:**
- App sm: 148×37 · md: 208×52 · lg: 268×67
- Web nav: 152×38 · footer: 88×22

---

## Colour Palette

### Core Brand Colours

| Name | Hex | Use |
|---|---|---|
| Moss | `#2E5438` | Primary brand green. Logo mark. Buttons. Headings on light. |
| Forest | `#1E4D35` | Deep green. Dark slide backgrounds. |
| Green | `#2D6A4F` | Mid green. CTA backgrounds. |
| Light green | `#52B788` | Accents. Active states. |
| Pale green | `#95D5B2` | Subtle accents on dark backgrounds. Eyebrow text on green. |
| Linen | `#F8F3EC` | App icon background. Meal Prep Light theme base. |
| Cream | `#F8F4ED` | Light slide backgrounds. Body backgrounds. |
| Off-white | `#F0EBE1` | Alternating slide backgrounds. Cards. |
| Warm | `#E8DDD0` | Muted light backgrounds. |
| Accent orange | `#E8854A` | Relatable/problem content. High contrast. Contrast slides. |
| Dark | `#181812` | Near-black. Dark slide backgrounds. How-to template. |
| Charcoal | `#2C2C24` | Bridge slides. Dark editorial backgrounds. |

### App Themes (4 states)
The app has 4 colour themes — always use `useTheme()`, never hardcode hex in app code.

- **Spontaneous Light** — standard light mode
- **Spontaneous Dark** — standard dark mode
- **Meal Prep Light** — linen `#F8F3EC` + moss `#2E5438`
- **Meal Prep Dark** — dark variant of meal prep

Full values live in `constants/theme.ts`.

---

## Typography

```
Recipe titles:     Georgia, serif, italic, weight 400  ← NEVER sans-serif
Section headings:  Georgia, serif, italic, weight 700
Metadata/labels:   SF Pro, weight 400, 11px, uppercase, 0.08em letter-spacing
Body / steps:      SF Pro, weight 400, 16px
```

**Hard rule:** Recipe titles and anything expressive always use Georgia italic. This is non-negotiable and core to the editorial identity. Monospace (system) for labels, counters, and technical metadata.

---

## TikTok & Marketing Design Rules

### Carousel Slide Format
- **Dimensions:** 1080×1920px (9:16)
- **Max text per slide:** 20 words. One idea per slide.
- **Slide count:** 5–10 slides. Sweet spot is 7.
- **Always add a trending audio** — even on photo carousels.
- **Logo placement:** Top left, small. Slide counter top right. Progress dots bottom left.
- **Last slide:** Always ends with `getmori.app` + CTA.

### Three Core Carousel Templates

**Template A — Listicle (forest green #1E4D35 hook slide)**
- Hook: dark green background, cream serif headline, pale green eyebrow
- Interior slides: cream/off-white alternating, faded number watermark
- Use for: "7 dinners under 30 min", recipe roundups, tip lists
- Goal: saves

**Template B — How-To (near-black #181812 hook slide)**
- Hook: dark background, step label in monospace pale green, serif cream headline
- Interior slides: cream/off-white, monospace step label, horizontal line divider
- Use for: "How to meal plan in 5 minutes", feature walkthroughs
- Goal: follows

**Template C — Relatable Problem (accent orange #E8854A hook slide)**
- Hook: orange background, white serif headline, italic subtext
- Interior slides: cream/off-white, emoji per slide, pain point + punchline
- Use for: "5 signs you need this", decision fatigue story
- Goal: comments + shares

### Video Tone
- Conversational, not salesy. Never hype language.
- Show the product doing the thing — don't describe it.
- The wow moment: swipe → taste profile builds → grocery list auto-generates → one tap to Instacart.
- Real UI over polished animations. Screen recordings over mockups.
- Calm energy. Forest energy. Not a TechCrunch launch video.

### Approved Hashtag Sets

**Discovery / Recipe**
`#mori #recipeapp #recipeideas #dinnerideas #whatsfordinner #mealideas #foodtok #fyp`

**Meal Prep**
`#mealprep #mealplanning #sundayreset #mealprepping #healthyeating #mealprepsunday #mori`

**App Launch**
`#newapp #appstore #ios #mori #recipeapp #fyp`

**Grocery / Save Money**
`#grocerydelivery #savemoney #budgetmeals #grocerylist #mori #foodhacks #fyp`

---

## App Store Assets

### Screenshots (match TikTok brand language)
- **Screenshot 1:** Swipe UI with a beautiful recipe card. Overlay: *"Recipes picked for your taste."*
- **Screenshot 2:** Taste profile screen. Overlay: *"Mori learns what you like."*
- **Screenshot 3:** Grocery list grouped by category. Overlay: *"Your list, built automatically."*
- **Screenshot 4:** One tap to Instacart. Overlay: *"One tap to Instacart."*
- **Screenshot 5:** Weekly meal grid. Overlay: *"Plan your whole week."*

### App Store Description Opening
Lead with pain, not product:

> *Tired of staring at your fridge at 7pm wondering what to make?*
>
> Mori is the recipe app that actually gets you. Swipe through recipes tailored to your taste, save the ones you love, and send your grocery list to Instacart in one tap.

Never open with: "Mori is an AI-powered…" or "Introducing Mori…"

---

## What Not To Do

- Never use sans-serif for recipe titles or anything expressive
- Never say "AI" in consumer-facing copy unless explaining the taste profile specifically
- Never claim groceries are delivered by Mori — Instacart handles fulfilment
- Never use the app icon on a non-linen background
- Never recreate logos as SVG or inline code — use the PNG assets
- Never make Mori feel like a diet app, calorie tracker, or fitness tool
- Never use aggressive or hype-driven language — the forest is calm
- Never hardcode hex values in app code — always `useTheme()`

---

*v1.0 — Created April 2026. Sync with claude.md on any feature changes. Marketing claims must match current build state.*
