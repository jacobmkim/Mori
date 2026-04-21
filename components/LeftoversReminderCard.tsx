import { useState, useEffect } from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useLeftoversStore } from '@/stores/leftoversStore';
import type { UserLeftover } from '@/types';

const DAY_MS = 86_400_000;
const GRACE_MS = 10 * 60 * 1000; // don't remind immediately after adding

// Tracks which leftover has already been shown this JS session so the modal
// only appears once per leftover ID (resets on full app restart).
let lastShownId: string | null = null;

// Returns the single most-urgent leftover to remind about:
// dismissed_at is null, spoils_at is within the next 2 days (or past by <2d).
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
  return candidates.sort((a, b) => new Date(a.spoils_at).getTime() - new Date(b.spoils_at).getTime())[0];
}

function daysLabel(spoilsAt: string): string {
  const diff = (new Date(spoilsAt).getTime() - Date.now()) / DAY_MS;
  if (diff < 0) return 'past its best-by date';
  if (diff < 1) return 'today';
  if (diff < 2) return 'tomorrow';
  return `in ${Math.ceil(diff)} days`;
}

export function LeftoversReminderModal() {
  const colors = useTheme();
  const { leftovers, dismissLeftover, extendLeftover } = useLeftoversStore();
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<UserLeftover | null>(null);

  useEffect(() => {
    // Skip items added within the grace period so the modal doesn't flash
    // right after the user saves leftovers from PostCookLeftoversModal.
    const settled = leftovers.filter((l) => {
      const addedAt = new Date(l.added_at).getTime();
      return isNaN(addedAt) || Date.now() - addedAt > GRACE_MS;
    });
    const urgent = urgentLeftover(settled);
    if (urgent && urgent.id !== lastShownId) {
      lastShownId = urgent.id;
      setCurrent(urgent);
      setVisible(true);
    }
  }, [leftovers]);

  function handleStillHaveIt() {
    if (current) extendLeftover(current.id, 2);
    setVisible(false);
  }

  function handleUsed() {
    if (current) dismissLeftover(current.id);
    setVisible(false);
  }

  function handleTossed() {
    if (current) dismissLeftover(current.id);
    setVisible(false);
  }

  if (!current) return null;

  const isPast = new Date(current.spoils_at).getTime() < Date.now();
  const accentColor = isPast ? colors.error : colors.primary;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => setVisible(false)}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={() => setVisible(false)}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 28,
            paddingBottom: 48,
            gap: 20,
          }}
        >
          {/* Icon + title */}
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 52, height: 52, borderRadius: 26,
              backgroundColor: accentColor + '18',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="time-outline" size={26} color={accentColor} />
            </View>
            <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 22, color: colors.text, textAlign: 'center' }}>
              Still have that {current.ingredient_name}?
            </Text>
            <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 }}>
              It expires {daysLabel(current.spoils_at)}.{'\n'}What happened to it?
            </Text>
          </View>

          {/* Actions */}
          <View style={{ gap: 10 }}>
            <Pressable
              onPress={handleStillHaveIt}
              style={{
                backgroundColor: accentColor,
                borderRadius: 16, paddingVertical: 16, alignItems: 'center',
              }}
            >
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Still have it — extend 2 days</Text>
            </Pressable>
            <Pressable
              onPress={handleUsed}
              style={{
                borderWidth: 1.5, borderColor: accentColor,
                borderRadius: 16, paddingVertical: 16, alignItems: 'center',
              }}
            >
              <Text style={{ color: accentColor, fontWeight: '600', fontSize: 16 }}>I used it</Text>
            </Pressable>
            <Pressable
              onPress={handleTossed}
              style={{ paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 15 }}>Tossed it</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
