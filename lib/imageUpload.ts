// Shared image-upload validation for AddRecipeWizard and edit-profile.
// Guards against:
//   - Oversize uploads that crash the JS thread on low-memory iOS devices
//     (a 20 MB HEIC pulled into memory + arrayBuffer ~ 60 MB peak).
//   - Non-image MIME types (the previous code hardcoded contentType: 'image/jpeg'
//     regardless of actual type — uploading any file as a fake JPEG).
//   - Egress abuse via large uploads.

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export interface ImageBlobResult {
  blob: Blob;
  contentType: string;
}

export class ImageValidationError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = 'ImageValidationError';
  }
}

/**
 * Fetches the image at a local URI, validates size + MIME, and returns the
 * blob ready for Supabase Storage upload. Throws ImageValidationError with a
 * user-friendly message when validation fails.
 *
 * @param uri          Local file URI from expo-image-picker.
 * @param maxBytes     Max accepted file size in bytes (default 5 MB).
 */
export async function validateImageForUpload(
  uri: string,
  maxBytes: number = 5 * 1024 * 1024,
): Promise<ImageBlobResult> {
  const response = await fetch(uri);
  const blob = await response.blob();

  if (blob.size === 0) {
    throw new ImageValidationError('That image looks empty. Try another photo.');
  }

  if (blob.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw new ImageValidationError(`Image must be under ${mb} MB. Try a smaller photo.`);
  }

  // blob.type may be empty on iOS for HEIC; default to jpeg in that case
  // since ImagePicker re-encodes to JPEG when `quality` is set.
  const contentType = (blob.type && blob.type.length > 0) ? blob.type : 'image/jpeg';
  if (!ALLOWED_MIME.has(contentType)) {
    throw new ImageValidationError('Only JPEG, PNG, WebP, or HEIC images are supported.');
  }

  return { blob, contentType };
}
