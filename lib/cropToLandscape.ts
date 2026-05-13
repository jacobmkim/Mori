import * as ImageManipulator from 'expo-image-manipulator';

// Forces a recipe photo into a 4:3 landscape frame before upload. Solves the
// "vertical photos look bad on landscape cards" problem on iOS, where the
// native picker's `aspect: [4, 3]` option is silently ignored
// (allowsEditing only does free / square crops on iOS).
//
// Behaviour:
//   - width / height already ≥ 4/3  → returned unchanged (no manipulator pass).
//   - portrait or near-square      → center-crops to a 4:3 box, height-limited.
//   - returned URI points to a NEW file written by expo-image-manipulator.
//     The original picked URI is left alone.
//
// 4:3 chosen because every curated recipe is already 4:3 and every render
// surface (cards, detail modal, web preview) is sized for that aspect.

const TARGET_RATIO = 4 / 3; // width / height

export interface CropToLandscapeResult {
  uri: string;
  width: number;
  height: number;
}

/**
 * Loads the source image's intrinsic dimensions. Uses `manipulateAsync` with
 * an empty operations list — cheapest cross-platform way to get accurate
 * pixel dimensions (RN's `Image.getSize` doesn't work for local file:// URIs
 * on all platforms).
 */
async function getSourceDimensions(uri: string): Promise<{ width: number; height: number }> {
  const out = await ImageManipulator.manipulateAsync(uri, [], { compress: 1 });
  return { width: out.width, height: out.height };
}

export async function cropToLandscape(uri: string): Promise<CropToLandscapeResult> {
  const { width, height } = await getSourceDimensions(uri);

  // Already 4:3 or wider — skip the manipulator round-trip entirely.
  // Tolerance of 1px guards against off-by-one results from prior crops.
  if (width >= height * TARGET_RATIO - 1) {
    return { uri, width, height };
  }

  // Portrait / near-square. Center-crop to the widest possible 4:3 box.
  // We use the full width and shrink height; this preserves the most of the
  // dish detail (food photos are usually centred and wider than they are tall
  // once cropped).
  const cropWidth = width;
  const cropHeight = Math.round(width / TARGET_RATIO);
  const originX = 0;
  const originY = Math.round((height - cropHeight) / 2);

  const cropped = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX, originY, width: cropWidth, height: cropHeight } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );

  return { uri: cropped.uri, width: cropped.width, height: cropped.height };
}
