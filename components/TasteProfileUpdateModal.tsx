/**
 * TasteProfileUpdateModal.tsx
 * In-app popup shown when the user's taste profile has been
 * refreshed since they last opened the app.
 */
import { Modal, View, Text, Pressable } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  visible: boolean;
  profileText: string;
  onViewProfile: () => void;
  onDismiss: () => void;
}

export function TasteProfileUpdateModal({ visible, profileText, onViewProfile, onDismiss }: Props) {
  const colors = useTheme();

  return (
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
            {/* Icon + title */}
            <Text style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>🌿</Text>
            <Text style={{
              fontFamily: 'Georgia',
              fontStyle: 'italic',
              fontSize: 20,
              fontWeight: '700',
              color: colors.text,
              textAlign: 'center',
              marginBottom: 16,
            }}>
              Your taste has evolved
            </Text>

            {/* Profile text */}
            <View style={{
              backgroundColor: colors.background,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
              marginBottom: 24,
            }}>
              <Text style={{
                fontStyle: 'italic',
                fontSize: 15,
                color: colors.text,
                lineHeight: 22,
                textAlign: 'center',
              }}>
                "{profileText}"
              </Text>
            </View>

            {/* Actions */}
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
  );
}
