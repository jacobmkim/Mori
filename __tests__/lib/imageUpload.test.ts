/**
 * validateImageForUpload — guards image uploads against:
 *   - Empty / oversize blobs (low-memory iOS app kill, egress abuse).
 *   - Non-image MIME types (previous code uploaded any blob as fake image/jpeg).
 *
 * Used by AddRecipeWizard (5 MB cap) and edit-profile (2 MB cap).
 */

import { validateImageForUpload, ImageValidationError } from '@/lib/imageUpload';

// Helper — fake the global `fetch` so the validator runs without network.
function mockFetchOnce(blob: { size: number; type: string }) {
  const fetchMock = jest.fn().mockResolvedValueOnce({
    blob: () => Promise.resolve(blob as unknown as Blob),
  });
  (global as any).fetch = fetchMock;
  return fetchMock;
}

describe('validateImageForUpload — happy path', () => {
  it('returns blob + contentType for an in-bounds JPEG', async () => {
    mockFetchOnce({ size: 100_000, type: 'image/jpeg' });
    const result = await validateImageForUpload('file:///tmp/ok.jpg');
    expect(result.contentType).toBe('image/jpeg');
    expect(result.blob.size).toBe(100_000);
  });

  it('accepts PNG, WebP, HEIC, HEIF', async () => {
    for (const type of ['image/png', 'image/webp', 'image/heic', 'image/heif']) {
      mockFetchOnce({ size: 100, type });
      const result = await validateImageForUpload('file:///tmp/x');
      expect(result.contentType).toBe(type);
    }
  });

  it('defaults contentType to image/jpeg when blob.type is empty (iOS HEIC quirk)', async () => {
    mockFetchOnce({ size: 100, type: '' });
    const result = await validateImageForUpload('file:///tmp/x');
    expect(result.contentType).toBe('image/jpeg');
  });
});

describe('validateImageForUpload — rejection cases', () => {
  it('rejects empty blob', async () => {
    mockFetchOnce({ size: 0, type: 'image/jpeg' });
    await expect(validateImageForUpload('file:///tmp/empty.jpg')).rejects.toBeInstanceOf(ImageValidationError);
  });

  it('rejects blob over the default 5 MB cap', async () => {
    mockFetchOnce({ size: 6 * 1024 * 1024, type: 'image/jpeg' });
    await expect(validateImageForUpload('file:///tmp/huge.jpg')).rejects.toThrow(/under 5 MB/);
  });

  it('rejects blob over an explicit 2 MB cap (avatar path)', async () => {
    mockFetchOnce({ size: 3 * 1024 * 1024, type: 'image/jpeg' });
    await expect(
      validateImageForUpload('file:///tmp/avatar.jpg', 2 * 1024 * 1024),
    ).rejects.toThrow(/under 2 MB/);
  });

  it('accepts a blob exactly at the cap', async () => {
    mockFetchOnce({ size: 5 * 1024 * 1024, type: 'image/jpeg' });
    const result = await validateImageForUpload('file:///tmp/edge.jpg');
    expect(result.blob.size).toBe(5 * 1024 * 1024);
  });

  it('rejects unknown MIME type with a user-facing message', async () => {
    mockFetchOnce({ size: 100, type: 'application/pdf' });
    await expect(validateImageForUpload('file:///tmp/sneaky.pdf')).rejects.toThrow(
      /JPEG, PNG, WebP, or HEIC/,
    );
  });

  it('rejects video/* (not in allowlist)', async () => {
    mockFetchOnce({ size: 100, type: 'video/mp4' });
    await expect(validateImageForUpload('file:///tmp/clip.mp4')).rejects.toBeInstanceOf(ImageValidationError);
  });

  it('rejects text/html (would-be HTML smuggling)', async () => {
    mockFetchOnce({ size: 100, type: 'text/html' });
    await expect(validateImageForUpload('file:///tmp/x.html')).rejects.toBeInstanceOf(ImageValidationError);
  });
});
