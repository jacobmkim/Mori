import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';

export default function PrivacyPolicyScreen() {
  const colors = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>Privacy Policy</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 20 }}>
          Last updated: May 2026 (v4 — Reviews, leftovers, push, diagnostics)
        </Text>

        <Section title="Overview" colors={colors}>
          Mori ("we", "our", "the app") is a recipe discovery app built to help you find meals
          you'll love. This policy explains what data we collect, how we use it, and your rights
          around it.
        </Section>

        <Section title="What We Collect" colors={colors}>
          <BulletItem colors={colors} label="Account info">
            Your email address and a hashed password, used only to authenticate your account.
          </BulletItem>
          <BulletItem colors={colors} label="Dietary preferences">
            Goals, ingredient dislikes, cuisine preferences, cooking skill, and pantry staples
            you provide during onboarding or in Settings. Used entirely to personalise your
            recipe feed — never sold.
          </BulletItem>
          <BulletItem colors={colors} label="Recipe interactions">
            Swipes, saves, cooks, grocery adds, and notes. Used to improve your personal
            recommendations and to generate your AI Taste Profile.
          </BulletItem>
          <BulletItem colors={colors} label="AI Taste Profile">
            A short AI-generated description of your food personality, derived from your swipe
            history and preferences. Stored in your account and refreshed automatically once a
            month. You can regenerate or view it at any time in your profile.
          </BulletItem>
          <BulletItem colors={colors} label="Recipes you create">
            If you submit a community recipe, it is stored in our database. When you mark a recipe
            Public, your display name is shown alongside it on other users' Discover feed and
            recipe pages. Recipes marked Private remain visible only to you. You can edit or
            delete your recipes at any time from the "Mine" tab.
          </BulletItem>
          <BulletItem colors={colors} label="Recipe photos">
            If you add a photo to a recipe, the image is uploaded to our storage bucket and shown
            to other users when the recipe is Public. We access your photo library only when you
            tap "Add a photo" — we do not scan, browse, or store any other images.
          </BulletItem>
          <BulletItem colors={colors} label="Profile photo">
            If you set a profile picture, it is shown next to community recipes you submit.
          </BulletItem>
          <BulletItem colors={colors} label="Display name & username">
            Your display name appears on community recipes you publish. Your @username is a unique
            handle on your profile. Both are editable in Profile → Edit Profile (usernames are
            rate-limited to one change per 30 days).
          </BulletItem>
          <BulletItem colors={colors} label="Reviews & recipe flags">
            If you write a review on a recipe you've cooked, the rating, text, and your display
            name are visible to other users on that recipe page. If you flag a recipe as
            inaccurate, the flag is recorded against your account so we can prevent abuse.
          </BulletItem>
          <BulletItem colors={colors} label="Streaks & badges">
            We track how many days in a row you've cooked, the date of your most recent cook, and
            which badges you've unlocked. Used to show progress in your profile and to send streak
            reminders if you've enabled push.
          </BulletItem>
          <BulletItem colors={colors} label="Leftovers">
            If you log leftovers after cooking, the ingredient names and approximate spoil dates are
            stored to power expiry reminders and to bias future recommendations toward what you
            already have.
          </BulletItem>
          <BulletItem colors={colors} label="Push notification token">
            If you grant push permission, Expo issues an anonymous device token that we store
            against your account. We use it to send streak reminders, monthly taste-profile
            updates, and badge unlocks. Revoking iOS notification permission stops all sends.
          </BulletItem>
          <BulletItem colors={colors} label="Diagnostic data">
            We use Sentry to capture crashes and unhandled errors so we can fix bugs. Personally
            identifiable information (IP, headers, device IDs) is filtered out client-side before
            events are sent. Session replay is disabled.
          </BulletItem>
        </Section>

        <Section title="What We Don't Collect" colors={colors}>
          <BulletItem colors={colors}>Location data</BulletItem>
          <BulletItem colors={colors}>Contacts</BulletItem>
          <BulletItem colors={colors}>Device advertising identifiers</BulletItem>
          <BulletItem colors={colors}>Any data sold to or shared with advertisers</BulletItem>
        </Section>

        <Section title="How We Use Your Data" colors={colors}>
          Your data is used solely to operate Mori: authenticating you, surfacing recipes matched
          to your taste, generating personalised content (taste profiles, macro estimates, storage
          tips) via AI, and enabling features like meal planning and grocery lists.

          {'\n\n'}AI-generated content (taste profiles, macro estimates, storage tips, recipe
          validation) is produced by Anthropic's Claude. Your recipe interactions are sent to our
          server to generate these insights but are not stored by Anthropic.

          {'\n\n'}Your Taste Profile is refreshed automatically once a month using your latest
          activity. If it has changed since you last opened the app, a brief in-app notice will show
          you the update. No personal data leaves our servers for this feature — the profile is
          generated server-side and stored in your account only.

          {'\n\n'}If you grant push permission, we send transactional notifications: a daily
          streak-at-risk reminder (only if your streak would break that night), a monthly notice
          when your taste profile updates, and badge-unlock alerts. We do not send marketing or
          promotional pushes. Revoke at any time in iOS Settings.

          {'\n\n'}Transactional email is sent via Resend (welcome / verify-email at signup, password
          reset). We do not send marketing email.
        </Section>

        <Section title="Data Storage" colors={colors}>
          All user data is stored securely in Supabase (supabase.com), hosted on AWS in the United
          States. Data is encrypted in transit (TLS) and at rest. Row-level security ensures you
          can only access your own data.
        </Section>

        <Section title="Data Retention & Deletion" colors={colors}>
          You can delete your account and all associated data at any time from inside the app:
          tap your avatar to open Profile, scroll to the bottom, and tap "Delete Account". This
          immediately removes your account, swipes, saves, plans, pantry, notes, and reviews.
          Recipes you submitted to the community are de-attributed and retired.

          {'\n\n'}If you can't access the app, email us at hello@getmori.app and we will process
          the request within 7 days.
        </Section>

        <Section title="Third-Party Services" colors={colors}>
          <BulletItem colors={colors} label="Supabase">Authentication, data storage, recipe image hosting.</BulletItem>
          <BulletItem colors={colors} label="Anthropic (Claude)">
            AI content generation (taste profile, macros, storage tips, recipe validation). Requests
            include recipe/preference context but no identifying personal information.
          </BulletItem>
          <BulletItem colors={colors} label="Vercel">
            Serverless API hosting. Logs standard request metadata (IP, timestamp) for up to 30 days.
          </BulletItem>
          <BulletItem colors={colors} label="Expo Push Service">
            Delivers push notifications using an anonymous device token. No account data is sent.
          </BulletItem>
          <BulletItem colors={colors} label="Resend">
            Transactional email delivery (welcome / verify-email, password reset). Receives only
            your email address and the message body.
          </BulletItem>
          <BulletItem colors={colors} label="Sentry">
            Crash and error diagnostics. PII (IP, headers, request bodies) is stripped client-side
            before events are sent; session replay is disabled.
          </BulletItem>
          <BulletItem colors={colors} label="Instacart">
            When you tap "Send to Instacart", your grocery list (ingredient names and quantities
            only) is sent to Instacart to pre-fill a cart. Checkout happens in Instacart and is
            governed by Instacart's privacy policy. Mori receives an affiliate commission via
            Impact on attributed orders; the affiliate parameters are appended to the cart URL.
          </BulletItem>
        </Section>

        <Section title="Children's Privacy" colors={colors}>
          Mori is not directed at children under 13. We do not knowingly collect data from children.
          If you believe a child has provided us data, contact us at hello@getmori.app and we will
          delete it promptly.
        </Section>

        <Section title="Changes to This Policy" colors={colors}>
          We may update this policy as the app evolves. Significant changes will be communicated
          via an in-app notice. Continued use of Mori after changes constitutes acceptance.
        </Section>

        <Section title="Contact" colors={colors}>
          Questions or requests? Email us at{' '}
          <Text style={{ color: colors.primary }}>hello@getmori.app</Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({
  title, children, colors,
}: { title: string; children: React.ReactNode; colors: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{
        fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8,
      }}>
        {title}
      </Text>
      <Text style={{ fontSize: 14, color: colors.textMuted, lineHeight: 22 }}>
        {children}
      </Text>
    </View>
  );
}

function BulletItem({
  label, children, colors,
}: { label?: string; children: React.ReactNode; colors: ReturnType<typeof useTheme> }) {
  return (
    <Text style={{ fontSize: 14, color: colors.textMuted, lineHeight: 22, marginBottom: 6 }}>
      {'• '}
      {label ? <Text style={{ fontWeight: '600', color: colors.text }}>{label}: </Text> : null}
      {children}
    </Text>
  );
}
