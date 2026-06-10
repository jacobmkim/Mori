/**
 * validateImageForUpload — guards image uploads against:
 *   - Empty / oversize buffers (low-memory iOS app kill, egress abuse).
 *   - Non-image content (previous code uploaded any blob as fake image/jpeg).
 *
 * Used by AddRecipeWizard (5 MB cap) and edit-profile (2 MB cap).
 *
 * Content type is now derived from the file's MAGIC NUMBER, not its extension
 * or the picker-supplied MIME — both are spoofable (rename evil.html → x.jpg).
 *
 * The implementation reads files via expo-file-system's `File.bytes()` rather
 * than `fetch(uri).blob()` because the Blob path silently corrupts uploads
 * on RN/iOS — see lib/imageUpload.ts header comment.
 */

const mockBytes = jest.fn();

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    bytes: mockBytes,
  })),
}));

import { validateImageForUpload, ImageValidationError } from '@/lib/imageUpload';

// ── Real format signatures ──────────────────────────────────────────────────
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
const HEIC = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63];
const HTML = [0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45]; // <!DOCTYPE

// Build a buffer of `size` bytes that begins with `sig`.
function signed(sig: number[], size = 100): Uint8Array {
  const arr = new Uint8Array(Math.max(size, sig.length));
  arr.set(sig, 0);
  return arr;
}

beforeEach(() => {
  mockBytes.mockReset();
});

describe('validateImageForUpload — happy path (content sniffed from bytes)', () => {
  it('returns Uint8Array + contentType for an in-bounds JPEG', async () => {
    mockBytes.mockResolvedValueOnce(signed(JPEG, 100_000));
    const result = await validateImageForUpload('file:///tmp/ok.jpg');
    expect(result.contentType).toBe('image/jpeg');
    expect(result.byteLength).toBe(100_000);
    expect(result.data).toBeInstanceOf(Uint8Array);
  });

  it('sniffs PNG / WebP / HEIC from magic numbers regardless of extension', async () => {
    const cases = [
      { sig: PNG, expected: 'image/png' },
      { sig: WEBP, expected: 'image/webp' },
      { sig: HEIC, expected: 'image/heic' },
    ];
    for (const { sig, expected } of cases) {
      mockBytes.mockResolvedValueOnce(signed(sig));
      // Deliberately misleading extension — bytes win.
      const result = await validateImageForUpload('file:///tmp/x.jpg');
      expect(result.contentType).toBe(expected);
    }
  });

  it('trusts the bytes over a contradictory mimeOverride', async () => {
    mockBytes.mockResolvedValueOnce(signed(JPEG));
    const result = await validateImageForUpload('file:///tmp/no-ext', undefined, 'image/heic');
    expect(result.contentType).toBe('image/jpeg');
  });

  it('accepts a file exactly at the cap', async () => {
    mockBytes.mockResolvedValueOnce(signed(JPEG, 5 * 1024 * 1024));
    const result = await validateImageForUpload('file:///tmp/edge.jpg');
    expect(result.byteLength).toBe(5 * 1024 * 1024);
  });
});

describe('validateImageForUpload — rejection cases', () => {
  it('rejects a non-image disguised with an image extension (HTML bytes, .jpg name)', async () => {
    mockBytes.mockResolvedValueOnce(signed(HTML));
    await expect(validateImageForUpload('file:///tmp/evil.jpg')).rejects.toBeInstanceOf(
      ImageValidationError,
    );
  });

  it('rejects a non-image even with an image mimeOverride', async () => {
    mockBytes.mockResolvedValueOnce(signed(HTML));
    await expect(
      validateImageForUpload('file:///tmp/x', undefined, 'image/jpeg'),
    ).rejects.toBeInstanceOf(ImageValidationError);
  });

  it('rejects empty file', async () => {
    mockBytes.mockResolvedValueOnce(new Uint8Array(0));
    await expect(validateImageForUpload('file:///tmp/empty.jpg')).rejects.toBeInstanceOf(
      ImageValidationError,
    );
  });

  it('rejects file over the default 5 MB cap', async () => {
    mockBytes.mockResolvedValueOnce(signed(JPEG, 6 * 1024 * 1024));
    await expect(validateImageForUpload('file:///tmp/huge.jpg')).rejects.toThrow(/under 5 MB/);
  });

  it('rejects file over an explicit 2 MB cap (avatar path)', async () => {
    mockBytes.mockResolvedValueOnce(signed(JPEG, 3 * 1024 * 1024));
    await expect(
      validateImageForUpload('file:///tmp/avatar.jpg', 2 * 1024 * 1024),
    ).rejects.toThrow(/under 2 MB/);
  });

  it('wraps File-read errors as ImageValidationError', async () => {
    mockBytes.mockRejectedValueOnce(new Error('ENOENT'));
    await expect(validateImageForUpload('file:///tmp/missing.jpg')).rejects.toBeInstanceOf(
      ImageValidationError,
    );
  });
});
