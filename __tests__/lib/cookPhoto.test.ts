/**
 * Tests for lib/cookPhoto.ts — uploadCookPhoto.
 * Mocks cropToLandscape, validateImageForUpload, and supabase.storage.
 * Verifies: 4:3 crop pre-pass, {userId}/{recipeId}-*.jpg path scoping,
 * upload options, public-URL return, crop-failure fallback, and error surfacing.
 */

jest.mock('@/lib/imageUpload', () => {
  class ImageValidationError extends Error {
    userMessage: string;
    constructor(msg: string) {
      super(msg);
      this.userMessage = msg;
      this.name = 'ImageValidationError';
    }
  }
  return { validateImageForUpload: jest.fn(), ImageValidationError };
});

jest.mock('@/lib/cropToLandscape', () => ({ cropToLandscape: jest.fn() }));

jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: jest.fn() } },
}));

import { uploadCookPhoto, ImageValidationError } from '@/lib/cookPhoto';
import { validateImageForUpload } from '@/lib/imageUpload';
import { cropToLandscape } from '@/lib/cropToLandscape';
import { supabase } from '@/lib/supabase';

const mockValidate = validateImageForUpload as jest.Mock;
const mockCrop = cropToLandscape as jest.Mock;
const mockStorageFrom = supabase.storage.from as jest.Mock;

let mockUpload: jest.Mock;
let mockGetPublicUrl: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCrop.mockResolvedValue({ uri: 'file://cropped.jpg', width: 400, height: 300 });
  mockValidate.mockResolvedValue({
    data: new Uint8Array([1, 2, 3]),
    contentType: 'image/jpeg',
    byteLength: 3,
  });
  mockUpload = jest.fn().mockResolvedValue({ error: null });
  mockGetPublicUrl = jest.fn().mockReturnValue({
    data: { publicUrl: 'https://cdn.example.com/cook-photos/user-1/recipe-1-123.jpg' },
  });
  mockStorageFrom.mockReturnValue({ upload: mockUpload, getPublicUrl: mockGetPublicUrl });
});

describe('uploadCookPhoto', () => {
  it('uploads to the cook-photos bucket under {userId}/{recipeId}-*.jpg and returns the public URL', async () => {
    const url = await uploadCookPhoto('user-1', 'recipe-1', 'file://orig.jpg');

    expect(mockStorageFrom).toHaveBeenCalledWith('cook-photos');
    const [path, data, opts] = mockUpload.mock.calls[0];
    expect(path).toMatch(/^user-1\/recipe-1-\d+\.jpg$/);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(opts).toMatchObject({ upsert: true, contentType: 'image/jpeg' });
    expect(opts.cacheControl).toBeDefined();
    expect(mockGetPublicUrl).toHaveBeenCalledWith(path);
    expect(url).toBe('https://cdn.example.com/cook-photos/user-1/recipe-1-123.jpg');
  });

  it('crops to landscape before validating', async () => {
    await uploadCookPhoto('user-1', 'recipe-1', 'file://orig.jpg');
    expect(mockCrop).toHaveBeenCalledWith('file://orig.jpg');
    expect(mockValidate).toHaveBeenCalledWith('file://cropped.jpg', 5 * 1024 * 1024);
  });

  it('falls back to the original uri when cropping fails', async () => {
    mockCrop.mockRejectedValue(new Error('manipulator crash'));
    await uploadCookPhoto('user-1', 'recipe-1', 'file://orig.jpg');
    expect(mockValidate).toHaveBeenCalledWith('file://orig.jpg', 5 * 1024 * 1024);
  });

  it('surfaces ImageValidationError (so the caller can show userMessage)', async () => {
    mockValidate.mockRejectedValue(new ImageValidationError('Image must be under 5 MB.'));
    await expect(uploadCookPhoto('user-1', 'recipe-1', 'file://big.jpg')).rejects.toBeInstanceOf(ImageValidationError);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('re-throws storage upload errors (e.g. RLS denial)', async () => {
    mockUpload.mockResolvedValue({ error: new Error('row-level security denied') });
    await expect(uploadCookPhoto('user-1', 'recipe-1', 'file://x.jpg')).rejects.toThrow('row-level security denied');
  });
});
