/**
 * validateImageForUpload — guards image uploads against:
 *   - Empty / oversize buffers (low-memory iOS app kill, egress abuse).
 *   - Non-image MIME types (previous code uploaded any blob as fake image/jpeg).
 *
 * Used by AddRecipeWizard (5 MB cap) and edit-profile (2 MB cap).
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

function bytesOfSize(n: number): Uint8Array {
  return new Uint8Array(n);
}

beforeEach(() => {
  mockBytes.mockReset();
});

describe('validateImageForUpload — happy path', () => {
  it('returns Uint8Array + contentType for an in-bounds JPEG', async () => {
    mockBytes.mockResolvedValueOnce(bytesOfSize(100_000));
    const result = await validateImageForUpload('file:///tmp/ok.jpg');
    expect(result.contentType).toBe('image/jpeg');
    expect(result.byteLength).toBe(100_000);
    expect(result.data).toBeInstanceOf(Uint8Array);
  });

  it('infers contentType from .png/.webp/.heic/.heif extensions', async () => {
    const cases = [
      { uri: 'file:///tmp/x.png', expected: 'image/png' },
      { uri: 'file:///tmp/x.webp', expected: 'image/webp' },
      { uri: 'file:///tmp/x.heic', expected: 'image/heic' },
      { uri: 'file:///tmp/x.heif', expected: 'image/heif' },
      { uri: 'file:///tmp/x.JPEG', expected: 'image/jpeg' },
    ];
    for (const { uri, expected } of cases) {
      mockBytes.mockResolvedValueOnce(bytesOfSize(100));
      const result = await validateImageForUpload(uri);
      expect(result.contentType).toBe(expected);
    }
  });

  it('strips query strings before inferring extension', async () => {
    mockBytes.mockResolvedValueOnce(bytesOfSize(100));
    const result = await validateImageForUpload('file:///tmp/x.png?v=1');
    expect(result.contentType).toBe('image/png');
  });

  it('uses mimeOverride when provided and valid', async () => {
    mockBytes.mockResolvedValueOnce(bytesOfSize(100));
    const result = await validateImageForUpload('file:///tmp/no-ext', undefined, 'image/heic');
    expect(result.contentType).toBe('image/heic');
  });

  it('defaults to image/jpeg when URI has no recognizable extension', async () => {
    mockBytes.mockResolvedValueOnce(bytesOfSize(100));
    const result = await validateImageForUpload('file:///tmp/asset-id');
    expect(result.contentType).toBe('image/jpeg');
  });
});

describe('validateImageForUpload — rejection cases', () => {
  it('rejects empty file', async () => {
    mockBytes.mockResolvedValueOnce(bytesOfSize(0));
    await expect(validateImageForUpload('file:///tmp/empty.jpg')).rejects.toBeInstanceOf(
      ImageValidationError,
    );
  });

  it('rejects file over the default 5 MB cap', async () => {
    mockBytes.mockResolvedValueOnce(bytesOfSize(6 * 1024 * 1024));
    await expect(validateImageForUpload('file:///tmp/huge.jpg')).rejects.toThrow(/under 5 MB/);
  });

  it('rejects file over an explicit 2 MB cap (avatar path)', async () => {
    mockBytes.mockResolvedValueOnce(bytesOfSize(3 * 1024 * 1024));
    await expect(
      validateImageForUpload('file:///tmp/avatar.jpg', 2 * 1024 * 1024),
    ).rejects.toThrow(/under 2 MB/);
  });

  it('accepts a file exactly at the cap', async () => {
    mockBytes.mockResolvedValueOnce(bytesOfSize(5 * 1024 * 1024));
    const result = await validateImageForUpload('file:///tmp/edge.jpg');
    expect(result.byteLength).toBe(5 * 1024 * 1024);
  });

  it('ignores a bogus mimeOverride and falls back to extension/default', async () => {
    mockBytes.mockResolvedValueOnce(bytesOfSize(100));
    // application/pdf is not in the allowlist — override is dropped, extension
    // .pdf has no mapping, so we land on the safe image/jpeg default.
    // ImagePicker is configured for Images only, so this path is defensive.
    const result = await validateImageForUpload('file:///tmp/x.pdf', undefined, 'application/pdf');
    expect(result.contentType).toBe('image/jpeg');
  });

  it('wraps File-read errors as ImageValidationError', async () => {
    mockBytes.mockRejectedValueOnce(new Error('ENOENT'));
    await expect(validateImageForUpload('file:///tmp/missing.jpg')).rejects.toBeInstanceOf(
      ImageValidationError,
    );
  });
});
