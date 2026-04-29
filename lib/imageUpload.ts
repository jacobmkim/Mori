import { File } from 'expo-file-system';

// Why Uint8Array instead of Blob:
//   The Supabase JS SDK + React Native + iOS combination silently corrupts
//   `Blob` uploads built from `await fetch(file://...).blob()`. blob.size
//   reports correctly so client-side validation passes, but the actual request
//   body ships zero (or partial) bytes — the file at the resulting public URL
//   ends up empty / unreadable. Supabase docs require an ArrayBuffer (or
//   ArrayBufferView like Uint8Array) on RN; see
//   https://supabase.com/docs/reference/javascript/storage-from-upload
//   expo-file-system v19's `File.bytes()` returns a real JS Uint8Array,
//   bypassing the broken fetch-blob bridge.

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

export interface ImageUploadPayload {
  data: Uint8Array;
  contentType: string;
  byteLength: number;
}

export class ImageValidationError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = 'ImageValidationError';
  }
}

function inferContentType(uri: string, override?: string | null): string {
  if (override && ALLOWED_MIME.has(override)) return override;
  const cleaned = uri.split('?')[0].split('#')[0];
  const ext = cleaned.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_MIME[ext] ?? 'image/jpeg';
}

/**
 * Reads the image at `uri`, validates size + MIME, and returns a Uint8Array
 * ready for `supabase.storage.from(...).upload(path, payload.data, ...)`.
 * Throws ImageValidationError with a user-friendly message on failure.
 *
 * @param uri          Local file URI from expo-image-picker.
 * @param maxBytes     Max accepted file size in bytes (default 5 MB).
 * @param mimeOverride Caller-supplied MIME (e.g. ImagePicker asset.mimeType).
 *                     Used when the URI lacks a useful extension.
 */
export async function validateImageForUpload(
  uri: string,
  maxBytes: number = 5 * 1024 * 1024,
  mimeOverride?: string | null,
): Promise<ImageUploadPayload> {
  let bytes: Uint8Array;
  try {
    bytes = await new File(uri).bytes();
  } catch {
    throw new ImageValidationError('Could not read the photo. Try a different one.');
  }

  if (bytes.byteLength === 0) {
    throw new ImageValidationError('That image looks empty. Try another photo.');
  }
  if (bytes.byteLength > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw new ImageValidationError(`Image must be under ${mb} MB. Try a smaller photo.`);
  }

  const contentType = inferContentType(uri, mimeOverride);
  if (!ALLOWED_MIME.has(contentType)) {
    throw new ImageValidationError('Only JPEG, PNG, WebP, or HEIC images are supported.');
  }

  return { data: bytes, contentType, byteLength: bytes.byteLength };
}
