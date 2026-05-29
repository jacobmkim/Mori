import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/hooks/useTheme';
import { uploadCookPhoto, ImageValidationError } from '@/lib/cookPhoto';
import { getRecipeImageUrl } from '@/lib/recipeImage';
import type { Review } from '@/types';

const LABELS = ['', 'Not for me', 'It was okay', 'Pretty good', 'Really good!', 'Amazing!'];

interface ReviewComposerProps {
  existing?: Review | null;
  userId: string;
  recipeId: string;
  /** Suppress the "Write a review" heading when the host already supplies one
   *  (e.g. the post-cook prompt's "How was it?" header). */
  hideTitle?: boolean;
  onSubmit: (rating: number, text: string, photoUrl: string | null) => Promise<void>;
  onCancel: () => void;
}

export function ReviewComposer({ existing, userId, recipeId, hideTitle, onSubmit, onCancel }: ReviewComposerProps) {
  const colors = useTheme();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [text, setText] = useState(existing?.review_text ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(existing?.photo_url ?? null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSubmit = rating > 0 && !saving && !photoUploading;

  async function uploadPicked(uri: string) {
    setPhotoUploading(true);
    try {
      const url = await uploadCookPhoto(userId, recipeId, uri);
      setPhotoUrl(url);
    } catch (err) {
      if (err instanceof ImageValidationError) {
        Alert.alert('Photo not supported', err.userMessage);
      } else {
        Alert.alert('Could not upload photo', 'Please check your connection and try again.');
      }
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleTakePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take a photo of your dish.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) await uploadPicked(result.assets[0].uri);
  }

  async function handleChooseFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to add a photo of your dish.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) await uploadPicked(result.assets[0].uri);
  }

  function handleAddPhoto() {
    Alert.alert('Add a photo of your dish', undefined, [
      { text: 'Take Photo', onPress: handleTakePhoto },
      { text: 'Choose from Library', onPress: handleChooseFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onSubmit(rating, text.trim(), photoUrl);
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
      {!hideTitle && (
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 12 }}>
          {existing ? 'Edit your review' : 'Write a review'}
        </Text>
      )}

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

      {/* Cook photo — kept above the text field so it's visible before the
          keyboard opens (this is the headline feature of the cook-photos work). */}
      {photoUrl ? (
        <View style={{ marginBottom: 12 }}>
          <Image
            source={{ uri: getRecipeImageUrl(photoUrl, 'card') }}
            style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: colors.border }}
            contentFit="cover"
          />
          <Pressable
            onPress={() => setPhotoUrl(null)}
            hitSlop={8}
            style={{
              position: 'absolute', top: 8, right: 8,
              width: 28, height: 28, borderRadius: 14,
              backgroundColor: 'rgba(0,0,0,0.6)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={18} color="white" />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={handleAddPhoto}
          disabled={photoUploading}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            paddingVertical: 14, marginBottom: 12,
            borderRadius: 10, borderWidth: 1, borderColor: colors.border,
            borderStyle: 'dashed', backgroundColor: colors.background,
          }}
        >
          {photoUploading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={18} color={colors.textMuted} />
              <Text style={{ fontSize: 13, color: colors.textMuted }}>Add a photo of your dish</Text>
            </>
          )}
        </Pressable>
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
