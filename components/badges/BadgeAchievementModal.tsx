// badges/BadgeAchievementModal.tsx
// Animated achievement popup. Supports queuing multiple badges.

import React, { useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsDark } from '@/hooks/useTheme';
import { Badge } from './badgeData';
import { getBadgeColors } from './badgeColors';
import { BADGE_ICONS } from './BadgeIcons';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(SCREEN_W - 48, 320);
const DISK_SIZE = 92;

interface BadgeAchievementModalProps {
  queue: Badge[];
  onQueueChange: (next: Badge[]) => void;
  /** When true, badges show "Earned" / "Locked" framing instead of the celebratory "Achievement unlocked" copy. Used for tap-to-preview from the badge grid. */
  previewMode?: boolean;
}

export function BadgeAchievementModal({ queue, onQueueChange, previewMode = false }: BadgeAchievementModalProps) {
  const isDark = useIsDark();
  const badge = queue[0] ?? null;
  const visible = queue.length > 0;

  const backdropOpacity = useSharedValue(0);
  const badgeScale      = useSharedValue(0.3);
  const badgeRotate     = useSharedValue(-8);
  const cardY           = useSharedValue(50);
  const cardOpacity     = useSharedValue(0);
  const shimmerX        = useSharedValue(-DISK_SIZE);

  const text1Y   = useSharedValue(12);  const text1Op = useSharedValue(0);
  const text2Y   = useSharedValue(12);  const text2Op = useSharedValue(0);
  const text3Y   = useSharedValue(12);  const text3Op = useSharedValue(0);
  const btnY     = useSharedValue(12);  const btnOp   = useSharedValue(0);

  const SPRING_GENTLE = { damping: 20, stiffness: 200 } as const;
  const SPRING_BOUNCY = { damping: 12, stiffness: 180 } as const;

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 280 });
      badgeScale.value      = withDelay(120, withSpring(1, SPRING_BOUNCY));
      badgeRotate.value     = withDelay(120, withSpring(0, { damping: 15, stiffness: 120 }));
      cardY.value           = withDelay(320, withSpring(0, SPRING_GENTLE));
      cardOpacity.value     = withDelay(320, withTiming(1, { duration: 350 }));
      shimmerX.value        = withDelay(720, withTiming(DISK_SIZE * 2.5, {
        duration: 750, easing: Easing.out(Easing.quad),
      }));
      const textTiming = { duration: 260, easing: Easing.out(Easing.quad) } as const;
      [[text1Y, text1Op, 500], [text2Y, text2Op, 610],
       [text3Y, text3Op, 700], [btnY, btnOp, 820]].forEach(([yVal, opVal, delay]) => {
        (yVal as typeof text1Y).value  = withDelay(delay as number, withTiming(0, textTiming));
        (opVal as typeof text1Op).value = withDelay(delay as number, withTiming(1, textTiming));
      });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 220 });
      badgeScale.value      = withTiming(0.3, { duration: 180 });
      cardY.value           = withTiming(50,  { duration: 180 });
      cardOpacity.value     = withTiming(0,   { duration: 180 });
      [text1Y, text2Y, text3Y, btnY].forEach((v) => { v.value = 12; });
      [text1Op, text2Op, text3Op, btnOp].forEach((v) => { v.value = 0; });
      shimmerX.value = -DISK_SIZE;
    }
  }, [visible, badge?.id]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }, { rotate: `${badgeRotate.value}deg` }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardY.value }],
    opacity: cardOpacity.value,
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }, { skewX: '-20deg' }],
  }));
  const t1Style = useAnimatedStyle(() => ({ transform: [{ translateY: text1Y.value }], opacity: text1Op.value }));
  const t2Style = useAnimatedStyle(() => ({ transform: [{ translateY: text2Y.value }], opacity: text2Op.value }));
  const t3Style = useAnimatedStyle(() => ({ transform: [{ translateY: text3Y.value }], opacity: text3Op.value }));
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ translateY: btnY.value }], opacity: btnOp.value }));

  function dismiss() {
    onQueueChange(queue.slice(1));
  }

  if (!badge) return null;

  const colors = getBadgeColors(badge.category, isDark);
  const Icon = BADGE_ICONS[badge.icon];
  const isLocked = previewMode && !badge.earned;
  const borderColor = isLocked
    ? (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)')
    : badge.legendary ? colors.borderHigh : colors.border;

  const cardBg    = isDark ? '#1A1A14' : '#F8F3EC';
  const labelColor = isLocked
    ? (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)')
    : '#52B788';
  const titleColor = isDark ? '#F0EBE1' : '#181812';
  const descColor  = isDark ? 'rgba(240,235,225,0.6)' : 'rgba(24,24,18,0.5)';
  const pillBg     = isDark ? 'rgba(82,183,136,0.15)' : 'rgba(46,84,56,0.08)';
  const pillText   = isDark ? '#95D5B2' : '#2E5438';
  const divColor   = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(46,84,56,0.1)';
  const btnBg      = '#2E5438';

  const headerLabel = previewMode
    ? (badge.earned ? 'Earned' : 'Locked')
    : 'Achievement unlocked';
  const buttonLabel = queue.length > 1
    ? `Next badge (${queue.length - 1} more)`
    : (previewMode ? 'Close' : 'Keep cooking →');
  const diskBg = isLocked
    ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)')
    : colors.background;
  const iconColor = isLocked
    ? (isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.22)')
    : colors.icon;

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />

      <View style={styles.centerer} pointerEvents="box-none">
        <Animated.View style={[styles.badgeFloat, badgeStyle]}>
          <View
            style={[
              styles.disk,
              {
                backgroundColor: diskBg,
                borderColor,
                borderWidth: badge.legendary && !isLocked ? 3 : 2,
                opacity: isLocked ? 0.7 : 1,
              },
            ]}
          >
            <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.38)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            {Icon && <Icon size={Math.round(DISK_SIZE * 0.42)} color={iconColor} />}
          </View>

          {badge.legendary && !isLocked && (
            <View style={[styles.legendRing, { borderColor: colors.borderHigh }]} />
          )}
        </Animated.View>

        <Animated.View style={[styles.card, { width: CARD_W, backgroundColor: cardBg }, cardStyle]}>
          <Animated.Text style={[styles.unlockedLabel, { color: labelColor }, t1Style]}>
            {headerLabel}
          </Animated.Text>

          <Animated.Text style={[styles.badgeName, { color: titleColor }, t2Style]}>
            {badge.name}
          </Animated.Text>

          <Animated.Text style={[styles.badgeDesc, { color: descColor }, t3Style]}>
            {badge.description}
          </Animated.Text>

          <Animated.View style={[styles.pillWrap, t3Style]}>
            <View style={[styles.pill, { backgroundColor: pillBg }]}>
              <Text style={[styles.pillText, { color: pillText }]}>
                {badge.category.charAt(0).toUpperCase() + badge.category.slice(1)}
              </Text>
            </View>
          </Animated.View>

          <View style={[styles.divider, { backgroundColor: divColor }]} />

          <Animated.View style={btnStyle}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: btnBg }]}
              onPress={dismiss}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>
                {buttonLabel}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(30, 77, 53, 0.84)',
  },
  centerer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeFloat: {
    zIndex: 2,
    marginBottom: -(DISK_SIZE / 2 + 4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  disk: {
    width: DISK_SIZE,
    height: DISK_SIZE,
    borderRadius: DISK_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  legendRing: {
    position: 'absolute',
    width: DISK_SIZE + 12,
    height: DISK_SIZE + 12,
    borderRadius: (DISK_SIZE + 12) / 2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    top: -6,
    left: -6,
  },
  card: {
    borderRadius: 20,
    paddingTop: DISK_SIZE / 2 + 20,
    paddingHorizontal: 28,
    paddingBottom: 28,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  unlockedLabel: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: 'System',
    fontWeight: '500',
    marginBottom: 10,
  },
  badgeName: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 28,
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 10,
  },
  badgeDesc: {
    fontSize: 14,
    fontFamily: 'System',
    textAlign: 'center',
    lineHeight: 21,
  },
  pillWrap: {
    marginTop: 14,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    fontFamily: 'System',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    width: '100%',
    marginTop: 22,
    marginBottom: 4,
  },
  btn: {
    width: CARD_W - 56,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  btnText: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 16,
    color: '#F8F3EC',
  },
});
