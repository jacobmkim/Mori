// Brand-locked palette for the onboarding flow (welcome + 12 step screens).
// Onboarding is a one-time funnel; we deliberately ignore the user's system
// theme here so the experience always reads as the editorial linen "magazine"
// described in design.md. After onboarding completes, app screens go back to
// using the regular useTheme() hook for light/dark.
//
// Shape mirrors the keys consumed by existing onboarding screens (background,
// card, border, primary, primaryLight, text, textMuted, error) so each screen
// can swap `useTheme()` for `ONBOARDING_PALETTE` with no other refactor.

export const ONBOARDING_PALETTE = {
  // Surfaces
  background: '#F8F3EC',                 // linen — page bg
  card: '#FFFFFF',                       // white card on linen
  cardSelected: 'rgba(46,84,56,0.06)',   // pale moss wash on selection
  border: 'rgba(44,44,36,0.14)',         // hairline ink border
  divider: 'rgba(44,44,36,0.12)',        // editorial hairline rule

  // Brand
  primary: '#2E5438',                    // moss — CTA + selected outlines
  primaryLight: 'rgba(46,84,56,0.08)',   // mirror of cardSelected; supports legacy usage
  primaryDeep: '#1E4D35',                // forest — pressed state

  // Type
  text: '#2C2C24',                       // ink — headings, body
  textMuted: 'rgba(44,44,36,0.62)',      // muted ink — subtitles, helper text
  textSubtle: 'rgba(44,44,36,0.45)',     // captions, placeholders

  // Status
  error: '#B33A3A',
  success: '#2E5438',

  // Cuisine swipe deck overlays
  swipeRight: '#2E5438',
  swipeLeft: '#B33A3A',

  // Inline info box (privacy notice etc.)
  infoBg: 'rgba(46,84,56,0.08)',
  info: '#2E5438',

  // Inverse (text rendered on moss)
  inverse: '#F8F3EC',
  white: '#FFFFFF',
};

// Editorial type tokens — pair with ONBOARDING_PALETTE.
// Mirrors design.md typography rules.
export const ONBOARDING_TYPE = {
  // Section heading question, e.g. "Any dietary goals?"
  heading: {
    fontFamily: 'Georgia',
    fontStyle: 'italic' as const,
    fontWeight: '400' as const,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  // Subtitle directly under the heading.
  subhead: {
    fontFamily: 'System',
    fontWeight: '400' as const,
    fontSize: 15,
    lineHeight: 22,
  },
  // Small all-caps eyebrow above the heading.
  eyebrow: {
    fontFamily: 'System',
    fontWeight: '600' as const,
    fontSize: 11,
    letterSpacing: 2.0,
    textTransform: 'uppercase' as const,
  },
  // Field labels, option rows, body text.
  body: {
    fontFamily: 'System',
    fontWeight: '400' as const,
    fontSize: 15,
  },
  // CTA button label.
  cta: {
    fontFamily: 'System',
    fontWeight: '600' as const,
    fontSize: 16,
    letterSpacing: 0.4,
  },
};
