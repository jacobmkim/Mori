import { View, Text, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/hooks/useTheme';
import { getRecipeImageUrl } from '@/lib/recipeImage';
import type { CookPhoto } from '@/lib/api';

// Horizontal "Photos from people who cooked this" strip. Shown on the recipe
// detail (Overview + Reviews tabs). Renders nothing when there are no photos.
// Display-only for now — community cook photos are public social proof; the
// curated recipe hero stays the card image (see CLAUDE.md cook-photos decision).

interface CookPhotoStripProps {
  photos: CookPhoto[];
}

export function CookPhotoStrip({ photos }: CookPhotoStripProps) {
  const colors = useTheme();
  if (photos.length === 0) return null;

  return (
    <View style={{ marginTop: 4, marginBottom: 16 }}>
      <Text style={{
        fontFamily: 'Georgia', fontStyle: 'italic', fontWeight: '700',
        fontSize: 16, color: colors.text, marginBottom: 10,
      }}>
        Photos from people who cooked this
      </Text>
      <FlatList
        horizontal
        data={photos}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        initialNumToRender={3}
        windowSize={2}
        removeClippedSubviews
        ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
        renderItem={({ item }) => (
          <View style={{ width: 150 }}>
            <Image
              source={{ uri: getRecipeImageUrl(item.photo_url, 'card') }}
              style={{ width: 150, aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: colors.border }}
              contentFit="cover"
              transition={150}
            />
            {(item.reviewer_username || item.reviewer_name) ? (
              <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }} numberOfLines={1}>
                {item.reviewer_username ? `@${item.reviewer_username}` : item.reviewer_name}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
