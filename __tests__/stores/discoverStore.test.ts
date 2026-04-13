import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDiscoverStore } from '@/stores/discoverStore';

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

beforeEach(() => {
  useDiscoverStore.setState({ mode: 'spontaneous', appearanceMode: 'system', unitSystem: 'us' });
  jest.clearAllMocks();
});

describe('discoverStore — loadMode', () => {
  it('does not throw when AsyncStorage fails', async () => {
    mockAsyncStorage.getItem.mockRejectedValue(new Error('storage unavailable'));

    await expect(useDiscoverStore.getState().loadMode()).resolves.toBeUndefined();
  });

  it('keeps defaults when AsyncStorage fails', async () => {
    mockAsyncStorage.getItem.mockRejectedValue(new Error('storage unavailable'));

    await useDiscoverStore.getState().loadMode();

    const state = useDiscoverStore.getState();
    expect(state.mode).toBe('spontaneous');
    expect(state.appearanceMode).toBe('system');
    expect(state.unitSystem).toBe('us');
  });

  it('loads valid mode from storage', async () => {
    mockAsyncStorage.getItem
      .mockResolvedValueOnce('meal_prep')   // MODE_KEY
      .mockResolvedValueOnce('dark')        // APPEARANCE_KEY
      .mockResolvedValueOnce('metric');     // UNIT_KEY

    await useDiscoverStore.getState().loadMode();

    const state = useDiscoverStore.getState();
    expect(state.mode).toBe('meal_prep');
    expect(state.appearanceMode).toBe('dark');
    expect(state.unitSystem).toBe('metric');
  });

  it('ignores invalid/unknown values from storage', async () => {
    mockAsyncStorage.getItem
      .mockResolvedValueOnce('hacked_mode') // invalid
      .mockResolvedValueOnce('rainbow')     // invalid
      .mockResolvedValueOnce(null);         // missing

    await useDiscoverStore.getState().loadMode();

    const state = useDiscoverStore.getState();
    expect(state.mode).toBe('spontaneous');
    expect(state.appearanceMode).toBe('system');
    expect(state.unitSystem).toBe('us');
  });
});
