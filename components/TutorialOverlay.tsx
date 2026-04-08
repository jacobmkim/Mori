import { View, Text, Pressable, Animated, Modal, useWindowDimensions } from 'react-native';
import { useRef, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';

const tutorialKey = (userId: string) => `@mori_tutorial_seen_${userId}`;

type HighlightZone = 'card' | 'buttons' | 'tabs' | 'none';
type CardPosition = 'top' | 'middle' | 'bottom';
type ArrowStyle = 'horizontal' | 'tap' | 'down' | 'none';

interface Step {
  title: string;
  body: string;
  icon: string;
  zone: HighlightZone;
  cardPosition: CardPosition;
  arrowStyle: ArrowStyle;
  zoneLabel?: string;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Mori',
    body: "Your personal recipe discovery app. Let's take a quick look around.",
    icon: 'leaf-outline',
    zone: 'none',
    cardPosition: 'bottom',
    arrowStyle: 'none',
  },
  {
    title: 'Swipe to discover',
    body: 'Swipe right to save a recipe you love. Swipe left to skip. The more you interact, the smarter your recommendations get.',
    icon: 'swap-horizontal-outline',
    zone: 'card',
    cardPosition: 'bottom',
    arrowStyle: 'horizontal',
    zoneLabel: 'Swipe the card',
  },
  {
    title: 'Tap to see full recipe',
    body: 'Tap any card to open the full recipe — ingredients, step-by-step instructions, macros, and cooking mode.',
    icon: 'finger-print-outline',
    zone: 'card',
    cardPosition: 'bottom',
    arrowStyle: 'tap',
    zoneLabel: 'Tap the card',
  },
  {
    title: 'Quick actions',
    body: 'Skip (✕), undo, add to grocery list (🛒), or save (♥) — without opening the full recipe.',
    icon: 'apps-outline',
    zone: 'buttons',
    cardPosition: 'top',
    arrowStyle: 'down',
    zoneLabel: 'Action buttons',
  },
  {
    title: 'Everything in one place',
    body: 'Saved recipes, meal plan, and grocery list all live in the tabs below.',
    icon: 'grid-outline',
    zone: 'tabs',
    cardPosition: 'middle',
    arrowStyle: 'down',
    zoneLabel: 'Navigation tabs',
  },
];

interface Props {
  visible: boolean;
  onDone: () => void;
  userId: string;
}

export function TutorialOverlay({ visible, onDone, userId }: Props) {
  const colors = useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse highlight zone
  useEffect(() => {
    if (!visible) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [visible, step]);

  // Fade in on mount
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(cardAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const animateStep = (nextStep: number) => {
    Animated.timing(cardAnim, { toValue: 20, duration: 150, useNativeDriver: true }).start(() => {
      setStep(nextStep);
      Animated.timing(cardAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    });
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) animateStep(step + 1);
    else handleDone();
  };

  const handleBack = () => {
    if (step > 0) animateStep(step - 1);
  };

  const handleDone = () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
      AsyncStorage.setItem(tutorialKey(userId), 'true').catch(() => {});
      onDone();
    });
  };

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  const tabBarHeight = insets.bottom + 49;

  // Instruction card absolute position
  const cardPositionStyle: Record<string, number> = {};
  if (current.cardPosition === 'top') {
    cardPositionStyle.top = insets.top + 8;
  } else if (current.cardPosition === 'middle') {
    cardPositionStyle.top = screenHeight * 0.28;
  } else {
    cardPositionStyle.bottom = tabBarHeight + 24;
  }

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', opacity: fadeAnim }}>

        {/* Highlight zone border */}
        {current.zone !== 'none' && (
          <Animated.View
            style={[getZoneStyle(current.zone, screenHeight, tabBarHeight), { transform: [{ scale: pulseAnim }] }]}
            pointerEvents="none"
          />
        )}

        {/* Gesture / direction hint */}
        {current.arrowStyle !== 'none' && current.zone !== 'none' && (
          <View
            style={getHintPosition(current.zone, current.cardPosition, screenHeight, insets.top, tabBarHeight)}
            pointerEvents="none"
          >
            {current.arrowStyle === 'horizontal' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
                <Ionicons name="arrow-back" size={32} color="rgba(255,255,255,0.9)" />
                <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600' }}>
                  {current.zoneLabel}
                </Text>
                <Ionicons name="arrow-forward" size={32} color="rgba(255,255,255,0.9)" />
              </View>
            )}
            {current.arrowStyle === 'tap' && (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Ionicons name="hand-left-outline" size={32} color="rgba(255,255,255,0.9)" />
                <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600' }}>
                  {current.zoneLabel}
                </Text>
              </View>
            )}
            {current.arrowStyle === 'down' && (
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Ionicons name="arrow-down" size={28} color="rgba(255,255,255,0.9)" />
                <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600' }}>
                  {current.zoneLabel}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Tutorial card */}
        <Animated.View style={{
          position: 'absolute',
          left: 20,
          right: 20,
          ...cardPositionStyle,
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 24,
          transform: [{ translateY: cardAnim }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 16,
          elevation: 10,
        }}>
          {/* Skip */}
          {!isLast && (
            <Pressable onPress={handleDone} hitSlop={10} style={{ position: 'absolute', top: 16, right: 16 }}>
              <Text style={{ fontSize: 14, color: colors.textMuted }}>Skip</Text>
            </Pressable>
          )}

          {/* Icon */}
          <View style={{
            width: 48, height: 48, borderRadius: 14,
            backgroundColor: colors.primaryLight,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <Ionicons name={current.icon as any} size={24} color={colors.primary} />
          </View>

          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
            {current.title}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textMuted, lineHeight: 21, marginBottom: 20 }}>
            {current.body}
          </Text>

          {/* Footer: back + dots + next */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Back */}
            <Pressable
              onPress={handleBack}
              disabled={isFirst}
              hitSlop={10}
              style={{
                width: 36, height: 36, borderRadius: 10,
                borderWidth: isFirst ? 0 : 1,
                borderColor: colors.border,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              {!isFirst && <Ionicons name="arrow-back" size={18} color={colors.textMuted} />}
            </Pressable>

            {/* Step dots */}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {STEPS.map((_, i) => (
                <View key={i} style={{
                  width: i === step ? 18 : 6, height: 6, borderRadius: 3,
                  backgroundColor: i === step ? colors.primary : colors.border,
                }} />
              ))}
            </View>

            {/* Next / Get started */}
            <Pressable
              onPress={handleNext}
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: 22, paddingVertical: 10,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>
                {isLast ? 'Get started' : 'Next'}
              </Text>
            </Pressable>
          </View>
        </Animated.View>

      </Animated.View>
    </Modal>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getZoneStyle(zone: HighlightZone, screenHeight: number, tabBarHeight: number) {
  const base = {
    position: 'absolute' as const,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 20,
  };

  if (zone === 'card') {
    return { ...base, top: screenHeight * 0.12, left: 16, right: 16, height: screenHeight * 0.52 };
  }
  if (zone === 'buttons') {
    return { ...base, bottom: screenHeight * 0.14, left: 24, right: 24, height: 72, borderRadius: 36 };
  }
  if (zone === 'tabs') {
    return {
      ...base,
      bottom: 0, left: 0, right: 0,
      height: tabBarHeight,
      borderRadius: 0,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    };
  }
  return {};
}

// Position the gesture hint between the instruction card and the highlighted zone
function getHintPosition(
  zone: HighlightZone,
  cardPosition: CardPosition,
  screenHeight: number,
  topInset: number,
  tabBarHeight: number,
) {
  const base = {
    position: 'absolute' as const,
    left: 0 as const,
    right: 0 as const,
    alignItems: 'center' as const,
  };

  if (zone === 'card') {
    // Card zone center (~38% from top) — hint floats in the middle of the card
    return { ...base, top: screenHeight * 0.36 };
  }
  if (zone === 'buttons') {
    // Instruction card is at top; buttons are ~14% from bottom. Place hint midway.
    return { ...base, bottom: screenHeight * 0.27 };
  }
  if (zone === 'tabs') {
    // Instruction card is in middle; hint sits just above the tab bar
    return { ...base, bottom: tabBarHeight + 16 };
  }
  return base;
}

// ── Utility ───────────────────────────────────────────────────────────────────

export async function shouldShowTutorial(userId: string): Promise<boolean> {
  try {
    const seen = await AsyncStorage.getItem(tutorialKey(userId));
    return seen !== 'true';
  } catch {
    return false;
  }
}
