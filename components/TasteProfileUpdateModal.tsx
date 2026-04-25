import { Modal, View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  visible: boolean;
  profileText: string;
  isFirstTime?: boolean;
  onViewProfile: () => void;
  onDismiss: () => void;
}

export function TasteProfileUpdateModal({ visible, profileText, isFirstTime, onViewProfile, onDismiss }: Props) {
  const colors = useTheme();
  const [shareLoading, setShareLoading] = useState(false);
  const cardRef = useRef<View>(null);

  async function handleShareImage() {
    if (!cardRef.current || !profileText) return;
    setShareLoading(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your taste profile' });
      } else {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(uri);
          Alert.alert('Saved!', 'Taste profile card saved to your photos.');
        }
      }
    } catch {
      Alert.alert('Could not share', 'Try again in a moment.');
    } finally {
      setShareLoading(false);
    }
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
          onPress={onDismiss}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{
              backgroundColor: colors.card,
              borderRadius: 20,
              padding: 28,
              maxWidth: 360,
              width: '100%',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.18,
              shadowRadius: 24,
            }}>
              <Text style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>
                {isFirstTime ? '🌱' : '🌿'}
              </Text>
              <Text style={{
                fontFamily: 'Georgia',
                fontStyle: 'italic',
                fontSize: 20,
                fontWeight: '700',
                color: colors.text,
                textAlign: 'center',
                marginBottom: 16,
              }}>
                {isFirstTime ? 'Your taste profile is ready' : 'Your taste has evolved'}
              </Text>

              <View style={{
                backgroundColor: colors.background,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 16,
                marginBottom: 16,
              }}>
                <Text style={{
                  fontFamily: 'Georgia',
                  fontStyle: 'italic',
                  fontSize: 15,
                  color: colors.text,
                  lineHeight: 22,
                  textAlign: 'center',
                }}>
                  "{profileText}"
                </Text>
              </View>

              {/* Share as image */}
              <Pressable
                onPress={handleShareImage}
                disabled={shareLoading}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                  paddingVertical: 10, marginBottom: 16,
                }}
              >
                {shareLoading
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Ionicons name="share-outline" size={16} color={colors.primary} />
                }
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '500' }}>Share</Text>
              </Pressable>

              <Pressable
                onPress={onViewProfile}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>View My Profile</Text>
              </Pressable>

              <Pressable onPress={onDismiss} style={{ paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>Got it</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Hidden card for image capture — outside Modal so captureRef works */}
      <View ref={cardRef} collapsable={false} style={{
        position: 'absolute', left: -9999, top: 0,
        width: 360, height: 360,
        backgroundColor: '#F8F3EC',
        borderRadius: 24,
        padding: 32,
        justifyContent: 'space-between',
      }}>
        <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 22, fontWeight: '700', color: '#2E5438' }}>
          mori
        </Text>
        <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 18, color: '#1a1a1a', lineHeight: 28, textAlign: 'center' }}>
          "{profileText}"
        </Text>
        <Text style={{ fontSize: 11, color: '#2E5438', textAlign: 'right', opacity: 0.6 }}>getmori.app</Text>
      </View>
    </>
  );
}
