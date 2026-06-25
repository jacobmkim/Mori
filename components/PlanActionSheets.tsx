import { View, Text, Pressable, ScrollView } from 'react-native';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

// Themed bottom sheets for the Plan tab — INLINE overlays (Views, NOT Modals), so they compose with
// the inline AutoPlanSheet / recipe-picker overlays without the iOS stacked-native-Modal freeze, and
// replace the bare ActionSheetIOS menus. High zIndex so they sit above the build sheet (50) + picker (60).

export type PlanSheetAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
};

const DESTRUCTIVE = '#D7263D';

/** A themed action menu (replaces ActionSheetIOS.showActionSheetWithOptions). */
export function PlanActionSheet({
  visible, title, subtitle, actions, onSelect, onClose,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: PlanSheetAction[];
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  if (!visible) return null;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, justifyContent: 'flex-end' }}>
      <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <View style={{
        backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22,
        paddingTop: 10, paddingBottom: 40, paddingHorizontal: 16,
      }}>
        <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 }} />
        {(title || subtitle) ? (
          <View style={{ alignItems: 'center', marginBottom: 14, paddingHorizontal: 8 }}>
            {!!subtitle && (
              <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '700' }}>
                {subtitle}
              </Text>
            )}
            {!!title && (
              <Text numberOfLines={2} style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 19, color: colors.text, textAlign: 'center', lineHeight: 24 }}>
                {title}
              </Text>
            )}
          </View>
        ) : null}
        <View style={{ gap: 8 }}>
          {actions.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => onSelect(a.key)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 14,
                backgroundColor: pressed ? colors.primaryLight : colors.card,
                borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                paddingHorizontal: 16, paddingVertical: 15,
              })}
            >
              <Ionicons name={a.icon} size={20} color={a.destructive ? DESTRUCTIVE : colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: a.destructive ? DESTRUCTIVE : colors.text }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={onClose}
          style={{ marginTop: 12, alignItems: 'center', paddingVertical: 15, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textMuted }}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

export type RepeatDayOption = { day: number; label: string; sub?: string; locked?: boolean; defaultOn?: boolean };

/** Day picker for "Repeat across the week" — choose exactly which days to plan a recipe on. */
export function RepeatDaysSheet({
  visible, recipeTitle, mealLabel, dayOptions, onConfirm, onClose,
}: {
  visible: boolean;
  recipeTitle: string;
  mealLabel: string;
  dayOptions: RepeatDayOption[];
  onConfirm: (days: number[]) => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Reset selection to the suggested default each time the sheet opens (source day + any "Open" days).
  useEffect(() => {
    if (visible) setSelected(new Set(dayOptions.filter((d) => d.defaultOn || d.locked).map((d) => d.day)));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  const toggle = (day: number, locked?: boolean) => {
    if (locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day); else next.add(day);
      return next;
    });
  };
  const count = selected.size;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 210, justifyContent: 'flex-end' }}>
      <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <View style={{
        backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22,
        paddingTop: 10, paddingBottom: 36, paddingHorizontal: 16, maxHeight: '88%',
      }}>
        <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 }} />
        <View style={{ alignItems: 'center', marginBottom: 4, paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '700' }}>
            Repeat · {mealLabel}
          </Text>
          <Text numberOfLines={2} style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 19, color: colors.text, textAlign: 'center', lineHeight: 24 }}>
            {recipeTitle}
          </Text>
          <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 6 }}>Pick the days to plan this on.</Text>
        </View>
        <ScrollView style={{ marginTop: 8 }} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {dayOptions.map((d) => {
            const on = selected.has(d.day);
            return (
              <Pressable
                key={d.day}
                onPress={() => toggle(d.day, d.locked)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  backgroundColor: on ? colors.primaryLight : colors.card,
                  borderRadius: 14, borderWidth: 1, borderColor: on ? colors.primary : colors.border,
                  paddingHorizontal: 16, paddingVertical: 14, opacity: d.locked ? 0.85 : 1,
                }}
              >
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? colors.primary : colors.border} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{d.label}</Text>
                  {!!d.sub && <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>{d.sub}</Text>}
                </View>
                {d.locked && <Text style={{ fontSize: 11, color: colors.textMuted }}>This day</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          disabled={count === 0}
          onPress={() => onConfirm([...selected])}
          style={{
            marginTop: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
            paddingVertical: 16, borderRadius: 14, backgroundColor: count === 0 ? colors.border : colors.primary,
          }}
        >
          <Ionicons name="repeat" size={18} color="white" />
          <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>Plan on {count} day{count === 1 ? '' : 's'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
