import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useLeftoversStore } from '@/stores/leftoversStore';
import type { UserLeftover } from '@/types';

const DAY_MS = 86_400_000;

// Returns the single most-urgent leftover to remind about:
// dismissed_at is null, spoils_at is within the next 24h (or already past by <2d).
export function urgentLeftover(leftovers: UserLeftover[]): UserLeftover | null {
  const now = Date.now();
  const window2d = now + 2 * DAY_MS;
  const past2d = now - 2 * DAY_MS;
  const candidates = leftovers.filter((l) => {
    if (l.dismissed_at) return false;
    const t = new Date(l.spoils_at).getTime();
    if (isNaN(t)) return false;
    return t >= past2d && t <= window2d;
  });
  if (!candidates.length) return null;
  // Most urgent first
  return candidates.sort((a, b) => new Date(a.spoils_at).getTime() - new Date(b.spoils_at).getTime())[0];
}

function daysLabel(spoilsAt: string): string {
  const diff = (new Date(spoilsAt).getTime() - Date.now()) / DAY_MS;
  if (diff < 0) return 'past best-by date';
  if (diff < 1) return 'today';
  if (diff < 2) return 'tomorrow';
  return `in ${Math.ceil(diff)} days`;
}

interface Props {
  onDismiss?: () => void;
}

export function LeftoversReminderCard({ onDismiss }: Props) {
  const colors = useTheme();
  const { leftovers, dismissLeftover, extendLeftover } = useLeftoversStore();
  const leftover = urgentLeftover(leftovers);

  if (!leftover) return null;

  const [acted, setActed] = useState(false);
  const name = leftover.ingredient_name;
  const label = daysLabel(leftover.spoils_at);
  const isPast = new Date(leftover.spoils_at).getTime() < Date.now();

  function handleYes() {
    if (acted) return;
    setActed(true);
    extendLeftover(leftover!.id, 2);
    onDismiss?.();
  }

  function handleNo() {
    if (acted) return;
    setActed(true);
    dismissLeftover(leftover!.id);
    onDismiss?.();
  }

  function handleUsed() {
    if (acted) return;
    setActed(true);
    dismissLeftover(leftover!.id);
    onDismiss?.();
  }

  return (
    <View style={{
      marginHorizontal: 16, marginBottom: 10,
      backgroundColor: isPast ? colors.error + '18' : colors.primaryLight,
      borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: isPast ? colors.error + '40' : colors.primary + '40',
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Ionicons name="time-outline" size={16} color={isPast ? colors.error : colors.primary} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: isPast ? colors.error : colors.primary, flex: 1 }}>
          Still have that {name}? Expires {label}.
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={handleYes}
          style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>Still have it</Text>
        </Pressable>
        <Pressable
          onPress={handleUsed}
          style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: 'white' }}>Used it</Text>
        </Pressable>
        <Pressable
          onPress={handleNo}
          style={{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 13, color: colors.textMuted }}>Tossed it</Text>
        </Pressable>
      </View>
    </View>
  );
}
