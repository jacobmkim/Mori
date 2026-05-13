/**
 * Tests for cropToLandscape — center-crops portrait images to 4:3 landscape
 * before recipe upload. iOS picker ignores `aspect: [4,3]` so we have to
 * normalise ourselves.
 *
 * Contracts:
 *  - Already-landscape images return unchanged (no manipulator round-trip).
 *  - Portrait images get center-cropped: full width, height = width / (4/3).
 *  - originY is centred (top/bottom waste split equally).
 */

const mockManipulate = jest.fn();

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: unknown[]) => mockManipulate(...args),
  SaveFormat: { JPEG: 'jpeg' as const },
}));

import { cropToLandscape } from '@/lib/cropToLandscape';

beforeEach(() => {
  mockManipulate.mockReset();
});

describe('cropToLandscape — no-op for already-landscape', () => {
  it('returns the source URI unchanged when width / height >= 4/3', async () => {
    mockManipulate.mockResolvedValueOnce({ uri: 'file:///in.jpg', width: 1600, height: 1200 });
    const out = await cropToLandscape('file:///in.jpg');
    expect(out.uri).toBe('file:///in.jpg');
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);
    // Only the dimension probe — no crop pass.
    expect(mockManipulate).toHaveBeenCalledTimes(1);
  });

  it('returns unchanged for wider-than-4:3 (16:9 landscape)', async () => {
    mockManipulate.mockResolvedValueOnce({ uri: 'file:///wide.jpg', width: 1920, height: 1080 });
    const out = await cropToLandscape('file:///wide.jpg');
    expect(out.uri).toBe('file:///wide.jpg');
    expect(mockManipulate).toHaveBeenCalledTimes(1);
  });
});

describe('cropToLandscape — center-crops portrait', () => {
  it('center-crops a 720×1280 phone photo to 4:3 landscape', async () => {
    mockManipulate
      .mockResolvedValueOnce({ uri: 'file:///portrait.jpg', width: 720, height: 1280 }) // dimensions probe
      .mockResolvedValueOnce({ uri: 'file:///cropped.jpg', width: 720, height: 540 });  // crop result

    const out = await cropToLandscape('file:///portrait.jpg');

    expect(out.uri).toBe('file:///cropped.jpg');
    expect(out.width).toBe(720);
    expect(out.height).toBe(540);

    // Second call is the crop op — verify the crop box math.
    const cropCall = mockManipulate.mock.calls[1];
    expect(cropCall[0]).toBe('file:///portrait.jpg');
    expect(cropCall[1]).toEqual([
      { crop: { originX: 0, originY: Math.round((1280 - 540) / 2), width: 720, height: 540 } },
    ]);
    expect(cropCall[2]).toMatchObject({ compress: 0.85, format: 'jpeg' });
  });

  it('crops a square 1000×1000 image to 1000×750 (full width, centred)', async () => {
    mockManipulate
      .mockResolvedValueOnce({ uri: 'file:///sq.jpg', width: 1000, height: 1000 })
      .mockResolvedValueOnce({ uri: 'file:///sq-cropped.jpg', width: 1000, height: 750 });

    const out = await cropToLandscape('file:///sq.jpg');

    expect(out.uri).toBe('file:///sq-cropped.jpg');
    expect(out.width).toBe(1000);
    expect(out.height).toBe(750);

    const cropCall = mockManipulate.mock.calls[1];
    expect(cropCall[1]).toEqual([
      { crop: { originX: 0, originY: 125, width: 1000, height: 750 } },
    ]);
  });
});
