import { Modal, View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { useTheme } from '@/hooks/useTheme';

interface FlavourDimension { score: number; note: string; }

interface Props {
  visible: boolean;
  profileText: string;
  flavourDna?: Record<string, FlavourDimension> | null;
  isFirstTime?: boolean;
  onViewProfile: () => void;
  onDismiss: () => void;
}

export function TasteProfileUpdateModal({ visible, profileText, flavourDna, isFirstTime, onViewProfile, onDismiss }: Props) {
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
        width: 300, height: 533,
        backgroundColor: '#F8F4ED',
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: '#2D6A4F',
        padding: 26,
        justifyContent: 'space-between',
      }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={{ fontSize: 9, fontFamily: 'monospace', color: '#2D6A4F', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 3 }}>taste profile</Text>
            <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 15, color: '#1E4D35', fontWeight: '700' }}>mori</Text>
          </View>
          <View style={{ backgroundColor: '#1E4D35', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 9, fontFamily: 'monospace', color: '#95D5B2', letterSpacing: 1 }}>
              {new Date().toLocaleString('default', { month: 'short' }).toLowerCase()} {new Date().getFullYear()}
            </Text>
          </View>
        </View>

        {/* DNA bars */}
        {flavourDna && (
          <View style={{ borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#2D6A4F', paddingVertical: 14 }}>
            <Text style={{ fontSize: 9, fontFamily: 'monospace', color: '#7A7468', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>your flavour dna</Text>
            {(['explorer', 'committed', 'speed', 'planner', 'devoted'] as const).map((dim) => {
              const d = flavourDna[dim];
              if (!d) return null;
              const barColor = d.score >= 70 ? '#1E4D35' : d.score >= 40 ? '#52B788' : '#E8854A';
              return (
                <View key={dim} style={{ marginBottom: 9 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <Text style={{ fontSize: 10, color: '#2C2C24', fontFamily: 'monospace', width: 70 }}>{dim}</Text>
                    <View style={{ flex: 1, height: 5, backgroundColor: '#E8DDD0', borderRadius: 3 }}>
                      <View style={{ width: `${d.score}%`, height: 5, backgroundColor: barColor, borderRadius: 3 }} />
                    </View>
                    <Text style={{ fontSize: 9, color: '#7A7468', fontFamily: 'monospace', width: 30, textAlign: 'right' }}>{d.score}%</Text>
                  </View>
                  <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 9, color: '#7A7468', paddingLeft: 78, lineHeight: 13 }}>{d.note}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Mori says */}
        <View>
          <Text style={{ fontSize: 9, fontFamily: 'monospace', color: '#7A7468', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>mori says</Text>
          <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 12, color: '#1E4D35', lineHeight: 18 }}>
            "{profileText}"
          </Text>
        </View>

        {/* Footer */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 8, fontFamily: 'monospace', color: '#7A7468', letterSpacing: 1 }}>getmori.app</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#1E4D35', opacity: 0.8 }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#52B788', opacity: 0.5 }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#E8854A', opacity: 0.5 }} />
          </View>
        </View>
      </View>
    </>
  );
}
