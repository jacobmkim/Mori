# Finalize the Mori+ Paywall in RevenueCat

*Generated 2026-06-16 from current RevenueCat Paywalls v2 + Apple 3.1.2 docs. Mori config pre-filled. Branch: `mori-plus`.*

## 1. WHAT "FINALIZE" MEANS

The paywall is a **remote design** you build and publish in the RevenueCat dashboard — not code. Once you click **Publish**, it renders inside the existing dev/TestFlight build with **no rebuild and no OTA** (the SDK fetches it at runtime via `getOfferings()`). Publishing the paywall is the **last blocker** before a sandbox purchase works end-to-end — right now "No paywall configured" appears precisely because the offering has products but no published paywall attached.

---

## 2. PRE-FLIGHT (verify before you build)

Do all of this in the RC dashboard for project **Mori** before touching the editor. If any check fails, the editor will show empty/blank package cards.

1. **Entitlement exists.** Left sidebar → **Project Settings → Product catalog → Entitlements** tab. Confirm an entitlement with identifier exactly `mori_plus` exists. Open it → confirm both `mori_plus_monthly` and `mori_plus_annual` are listed under **Attached Products**. If not: click **Attach** → select both.
2. **Products synced from ASC.** **Product catalog → Products** → **App Store** tab. Confirm `mori_plus_monthly` and `mori_plus_annual` appear with their identifiers matching ASC **verbatim**. The hard gate is ASC-side: both must be **"Ready to Submit"** in App Store Connect (they are). If a product is missing here, click **`+ New` → Import Products** and re-sync.
   - **Sanity check that actually proves wiring:** your dev build already fetches offerings and returns the right products — that confirms StoreKit can fetch them (no error 23). You're good.
3. **Offering `default` holds both packages.** **Product catalog → Offerings** → open `default`. Confirm two packages: one **Monthly** (`$rc_monthly`) → `mori_plus_monthly`, one **Annual** (`$rc_annual`) → `mori_plus_annual`.
4. **`default` is the Current/Default offering.** On the **Offerings** tab, find `default` → triple-dot **Actions** menu → **Make Default**. The SDK returns `offerings.current` (the default) when you present a paywall with no explicit offering. If `default` isn't the current offering, your published paywall won't surface.

---

## 3. BUILD THE PAYWALL (Paywalls v2 editor)

1. Left sidebar → **Paywalls** → **Create paywall**.
2. **Attach to Offering:** select `default` as the offering this paywall binds to.
   - **If the offering dropdown is grayed out / "no available offering":** a legacy v1 paywall is already attached to `default`. Delete that legacy paywall from the offering first, then re-attach this v2 one. (An offering can hold exactly one paywall.)
3. **Build mode:** choose **Use a template**. Pick a two-plan template ("stacked packages" / "multi-tier") so you start with two cards.
4. **Bind the two SKU cards.**
   - **Card 1 (top, highlighted) → Annual** (`$rc_annual` / `mori_plus_annual`).
   - **Card 2 (secondary) → Monthly** (`$rc_monthly` / `mori_plus_monthly`).
   - Each card: select the Package component → right-side property panel → set the bound package.
5. **Make the annual card the default selection + highlight it.** Select the annual Package component → property panel → toggle **Default** ("Selected by default") **ON**. Style its Selected/Default state (border, accent color) so it reads as the lead card.
   - **Publish will FAIL if no package is marked "Selected by default"** — mandatory.
6. **"Save 28%" badge on the annual card.** Add a **Text** component inside the annual card and insert the variable `{{ product.relative_discount }}` (auto-computed from real prices, drift-proof). Verify it renders ~28% before trusting it; or hardcode "Save 28%" as a safety net.
7. **Live price tokens (kill price drift — required for 3.1.2).** Render prices from the product, never literals:
   - Annual price Text: `{{ product.price_per_period }}` → "$59.99/year"
   - Monthly price Text: `{{ product.price_per_period }}` → "$6.99/month"
8. **Trial disclosure copy (verbatim — paste exactly).** RC does NOT auto-generate the legal renewal paragraph — type it into a plain **Text** component below each card's price. Must match the ASC introductory-offer config character-for-character:
   - **Annual card Text:**
     ```
     30 days free, then $59.99/year. Auto-renews unless cancelled at least 24 hours before period end. Cancel anytime in Settings.
     ```
   - **Monthly card Text:**
     ```
     30 days free, then $6.99/month. Auto-renews unless cancelled at least 24 hours before period end. Cancel anytime in Settings.
     ```
9. **Footer — Restore + Terms + Privacy.** Add a **Footer** component, then three **Button** components (action must be on a Button, not a bare Text label):
   - **Restore Purchases** → Action: **Restore Purchases**.
   - **Terms of Use** → Action: **Navigate to** → `https://getmori.app/terms` → **In-App Browser**.
   - **Privacy Policy** → Action: **Navigate to** → `https://getmori.app/privacy` → **In-App Browser**.
10. **CTA / Purchase Button.** One Purchase Button buys the *currently selected* package. Label e.g. **"Start 30-Day Free Trial"** (accurate — both SKUs have the trial).
11. **Title / value line.** Show **"Mori+"** + a short "what you get" line. Do NOT write "plans for the whole family's tastes" (household taste-merge is v1.2). "Share with your family" is allowed.
12. **Preview** (light + dark — Mori has 4 themes). Then **Publish Paywall**. Draft = inactive; only Publish makes it live, returned by the SDK immediately, no app update.

---

## 4. CONFIGURE CUSTOMER CENTER

Makes the app's `presentManageSubscription()` / Customer Center flow work.

1. **Project Settings → Monetization Tools → Customer Center.**
2. **Configuration → management paths.** Enable: **Cancellation** (+ default survey), **Missing Purchases** (Restore), **Refund Request** (iOS), **Plan Changes** (iOS, monthly↔annual).
3. **Win-back (Offers tab).** Pre-built: Cancellation Retention Discount + Refund Retention Discount. These only render if you've created the matching promo/win-back offer in ASC first. **Not a launch blocker** — Customer Center still presents cancel/restore/refund without it. Add post-launch.
4. **Support (optional).** Add a support email (e.g. `hello@getmori.app`).
5. **App-side dependency:** `react-native-purchases-ui` ✅ installed (`^10.2.2`, matches SDK) — powers both the paywall presenter and Customer Center.

---

## 5. WIRE THE WEBHOOK

Endpoint must be **deployed to Vercel first** (§8) and the secret set in **both** places (RC dashboard + Vercel env).

1. **Generate the shared secret:** `openssl rand -hex 32`
2. **Set it in Vercel** as `RC_WEBHOOK_SECRET` (Production env). Redeploy if not auto-picked-up.
3. **Add the webhook in RC.** **Project → Integrations → Webhooks → Add new configuration** (requires **Pro plan**).
   - **URL:** `https://getmori.app/api/rc-webhook`
   - **Authorization Header Value:** paste the **exact** secret from step 1. RC sends it **raw** (does NOT prepend `Bearer`). Server compares constant-time against `RC_WEBHOOK_SECRET` — must match verbatim.
4. **Send a TEST event.** Saved config → **Send test event**. Confirm RC shows **200** and your endpoint didn't 401.
   - RC retries failures 5× then stops. The function must **`await` all `is_premium` DB writes before returning 200** (Mori commandment).
5. **Confirm event coverage (code check):** grant `is_premium` on `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `PRODUCT_CHANGE`, `NON_RENEWING_PURCHASE`, `SUBSCRIPTION_EXTENDED`, `TRANSFER`; revoke ONLY on `EXPIRATION`. `CANCELLATION` ≠ revoke (access continues to expiry); `BILLING_ISSUE` ≠ revoke (grace).

---

## 6. APPLE 3.1.2 COMPLIANCE CHECK

Published paywall (in the binary) must satisfy ALL:

- [ ] Price rendered from product token, showing **$6.99/month** + **$59.99/year**, matching ASC.
- [ ] Subscription **title "Mori+"** + "what you get" line, visible before purchase.
- [ ] **Verbatim trial disclosure** on each card, matching the ASC introductory offer exactly (30-day trial on BOTH SKUs).
- [ ] **Terms of Use link loads** → `https://getmori.app/terms` (real content, not 404/empty).
- [ ] **Privacy Policy link loads** → `https://getmori.app/privacy`.
- [ ] **Restore Purchases visible** on paywall + functional (Button, not Text).
- [ ] **No toggle paywall** (banned Jan 2026).
- [ ] **No overclaiming** ("plans for the whole family's tastes").
- [ ] **Only new features paywalled** — swipe/save/plan/grocery/Instacart/filters stay free.
- **Fallback if review bounces on "incomplete auto-renewal disclosure":** the missing pieces are Apple's "Payment charged to your Apple ID at confirmation" + "unused free-trial portion forfeited on purchase" lines. Your locked strings are tighter; don't change unless rejected.

**ASC-side (IAP review, submitted with the binary)** — App Store Connect → app → Subscriptions → [group] → [each subscription]:

- [ ] **Replace the DUMMY App Review Screenshot** with a real capture of the published paywall. **1024×1024, JPG/PNG, 72dpi, RGB, flattened, no alpha** (recall the 2026-05-04 Windows-alpha rejection — flatten to 24-bit RGB).
- [ ] **Localized Display Name** (2–30 chars, e.g. "Mori+ Monthly" / "Mori+ Annual").
- [ ] **Review Notes** — include `apple-review@getmori.app` demo account + **exact steps to reveal the paywall** (behind the `EXPO_PUBLIC_MORI_PLUS_ENABLED` kill switch — tell the reviewer how to reach it).
- [ ] **Both SKUs in one subscription group** (upgrade/downgrade per 3.1.2(b)).
- [ ] **License Agreement (EULA)** in ASC → App Information — link/mirror `getmori.app/terms`.
- [ ] **App Privacy form** declares Purchase History + User ID (via RevenueCat).

---

## 7. VERIFY ON DEVICE

1. **Set up a Sandbox Tester:** ASC → Users and Access → Sandbox Testers → create one. On device: **Settings → Developer → Sandbox Apple Account** (iOS 18+) → sign in.
2. App → RC Debug → **Present paywall** — confirm the **real paywall renders** (two cards, annual highlighted "Save 28%", trial copy, footer links), not the placeholder.
3. **Tap a plan → buy** with the Sandbox Tester.
4. **Entitlement flips client-side:** `customerInfo.entitlements.active["mori_plus"]` active → `isPremium` true / gold ring appears.
5. **Webhook delivered:** RC dashboard → toggle **"View Sandbox Data"** → event log shows `INITIAL_PURCHASE` (SANDBOX) → webhook config shows **200**.
6. **Server wrote it:** Supabase → `profiles` row → **`is_premium = true`**.
   - If 4–5 pass but 6 doesn't: webhook not writing — check secret match, `await` before 200, grant on `INITIAL_PURCHASE`.
   - Sandbox renewal speed: monthly ~5 min, annual ~1 hr; TestFlight ~1/day. (Relevant to the 1-week dogfood gate.)

---

## 8. ORDER OF OPERATIONS

**[DEPLOY]** = Vercel push; **[DASH]** = dashboard only.

1. **[DEPLOY] Deploy Terms + Privacy** so `getmori.app/terms` + `/privacy` load. *Do this first — paywall links must be live before review.*
2. **[DEPLOY] Deploy `api/rc-webhook` + set `RC_WEBHOOK_SECRET`.** Smoke-test: route returns 401 on bad auth (not 404).
3. **[DASH] Pre-flight (§2).**
4. **[DASH] Build + Publish the paywall (§3).**
5. **[DASH] Configure Customer Center (§4).**
6. **[DASH] Add the webhook in RC (§5)** → Send test event → 200.
7. **[DASH] Create a Sandbox Tester.**
8. **[DEVICE] Test end-to-end (§7).**
9. **[DASH] ASC IAP review fields (§6)** → submit 6.1.0 binary + both IAPs together.

Steps 4–6 take effect with **no rebuild** — the paywall renders in the existing binary the moment you publish. Only the legal pages (1) and webhook (2) need a deploy.

---

**Verify-as-you-go (research couldn't fully confirm):** exact v2 template names; that the RC plan is **Pro** (webhooks need it); the precise label of the "Default/Selected by default" toggle.
