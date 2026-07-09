/**
 * Push-token hygiene: registration must claim the token exclusively (RPC strips
 * it from other profiles) and sign-out must detach the device. Guards against
 * the multi-account-device bug where one phone received crons for every
 * profile it had ever signed into.
 */

const mockRpc = jest.fn();
const mockEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn((..._args: unknown[]) => ({ update: mockUpdate }));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getSession: jest.fn() },
  },
}));

import { updatePushToken, clearPushToken } from '@/lib/api';

beforeEach(() => {
  mockRpc.mockReset();
  mockEq.mockReset();
  mockUpdate.mockClear();
  mockFrom.mockClear();
});

describe('updatePushToken — exclusive claim via RPC', () => {
  it('calls claim_push_token with the device token', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await updatePushToken('user-1', 'ExponentPushToken[abc]');
    expect(mockRpc).toHaveBeenCalledWith('claim_push_token', { p_token: 'ExponentPushToken[abc]' });
  });

  it('does NOT write push_token via a plain table update (RLS cannot dedupe)', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await updatePushToken('user-1', 'ExponentPushToken[abc]');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('throws when the RPC errors', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'not authenticated' } });
    await expect(updatePushToken('user-1', 'tok')).rejects.toBeTruthy();
  });
});

describe('clearPushToken — sign-out detach', () => {
  it('nulls push_token on the signed-out profile only', async () => {
    mockEq.mockResolvedValue({ error: null });
    await clearPushToken('user-1');
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockUpdate).toHaveBeenCalledWith({ push_token: null });
    expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('throws on DB error (callers swallow it so sign-out never blocks)', async () => {
    mockEq.mockResolvedValue({ error: { message: 'network' } });
    await expect(clearPushToken('user-1')).rejects.toBeTruthy();
  });
});
