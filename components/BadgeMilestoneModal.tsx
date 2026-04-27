import { View, Text, Pressable, Modal, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import type { Badge } from '@/lib/badges';

interface Props {
  badge: Badge | null;
  onDismiss: () => void;
}

export function BadgeMilestoneModal({ badge, onDismiss }: Props) {
  const colors = useTheme();
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!badge) return;
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [badge]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!badge) return null;

  return (
    <Modal transparent animationType="none" visible={!!badge} onRequestClose={onDismiss}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
        onPress={onDismiss}
      >
        <Animated.View style={{ transform: [{ scale }], opacity, width: 280 }}>
          <Pressable onPress={() => {}} style={{
            backgroundColor: colors.card,
            borderRadius: 24,
            alignItems: 'center',
            paddingTop: 36,
            paddingBottom: 28,
            paddingHorizontal: 24,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.18,
            shadowRadius: 24,
          }}>
            <View style={{
              width: 88, height: 88, borderRadius: 44,
              backgroundColor: colors.primaryLight,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
            }}>
              <Ionicons name={badge.icon as any} size={44} color={colors.primary} />
            </View>

            <Text style={{
              fontSize: 11, fontFamily: 'System', fontWeight: '600',
              letterSpacing: 0.1, color: colors.primary,
              textTransform: 'uppercase', marginBottom: 8,
            }}>
              Achievement Unlocked
            </Text>

            <Text style={{
              fontSize: 22, fontFamily: 'Georgia', fontStyle: 'italic',
              color: colors.text, textAlign: 'center', marginBottom: 8,
            }}>
              {badge.name}
            </Text>

            <Text style={{
              fontSize: 14, color: colors.textMuted,
              textAlign: 'center', lineHeight: 20,
            }}>
              {badge.description}
            </Text>

            <Text style={{
              fontSize: 12, color: colors.textMuted, marginTop: 20,
            }}>
              Tap to dismiss
            </Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
