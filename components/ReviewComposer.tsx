import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import type { Review } from '@/types';

const LABELS = ['', 'Not for me', 'It was okay', 'Pretty good', 'Really good!', 'Amazing!'];

interface ReviewComposerProps {
  existing?: Review | null;
  onSubmit: (rating: number, text: string) => Promise<void>;
  onCancel: () => void;
}

export function ReviewComposer({ existing, onSubmit, onCancel }: ReviewComposerProps) {
  const colors = useTheme();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [text, setText] = useState(existing?.review_text ?? '');
  const [saving, setSaving] = useState(false);

  const canSubmit = rating > 0 && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onSubmit(rating, text.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 16,
    }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 12 }}>
        {existing ? 'Edit your review' : 'Write a review'}
      </Text>

      {/* Star picker */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 6 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={star} onPress={() => setRating(star)} hitSlop={6}>
            <Ionicons
              name={star <= rating ? 'star' : 'star-outline'}
              size={32}
              color={star <= rating ? '#FFC107' : colors.border}
            />
          </Pressable>
        ))}
      </View>
      {rating > 0 && (
        <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
          {LABELS[rating]}
        </Text>
      )}

      {/* Text input */}
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Share what you thought (optional)"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={1000}
        style={{
          fontSize: 14,
          color: colors.text,
          backgroundColor: colors.background,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 12,
          minHeight: 80,
          textAlignVertical: 'top',
          marginBottom: 4,
        }}
      />
      <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: 'right', marginBottom: 12 }}>
        {text.length}/1000
      </Text>

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          onPress={onCancel}
          style={{
            flex: 1, paddingVertical: 12, borderRadius: 10,
            borderWidth: 1, borderColor: colors.border,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 14, color: colors.textMuted }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={{
            flex: 1, paddingVertical: 12, borderRadius: 10,
            backgroundColor: canSubmit ? colors.primary : colors.border,
            alignItems: 'center',
          }}
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={{ fontSize: 14, fontWeight: '600', color: 'white' }}>
              {existing ? 'Save' : 'Post review'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
