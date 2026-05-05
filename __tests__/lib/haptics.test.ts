jest.mock('expo-haptics', () => ({
  __esModule: true,
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
}));

import * as Haptics from 'expo-haptics';
import {
  rightSwipeHaptic,
  leftSwipeHaptic,
  timerDoneHaptic,
  stepAdvanceHaptic,
} from '@/lib/haptics';

const mockImpact = Haptics.impactAsync as jest.Mock;
const mockNotification = Haptics.notificationAsync as jest.Mock;
const mockSelection = Haptics.selectionAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('rightSwipeHaptic', () => {
  it('fires a single Medium impact', () => {
    rightSwipeHaptic();
    expect(mockImpact).toHaveBeenCalledTimes(1);
    expect(mockImpact).toHaveBeenCalledWith('medium');
  });
});

describe('leftSwipeHaptic', () => {
  it('fires two Rigid impacts ~60ms apart', () => {
    leftSwipeHaptic();
    expect(mockImpact).toHaveBeenCalledTimes(1);
    expect(mockImpact).toHaveBeenNthCalledWith(1, 'rigid');
    jest.advanceTimersByTime(59);
    expect(mockImpact).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2); // total 61ms
    expect(mockImpact).toHaveBeenCalledTimes(2);
    expect(mockImpact).toHaveBeenNthCalledWith(2, 'rigid');
  });
});

describe('timerDoneHaptic', () => {
  it('fires Success notification', () => {
    timerDoneHaptic();
    expect(mockNotification).toHaveBeenCalledTimes(1);
    expect(mockNotification).toHaveBeenCalledWith('success');
  });
});

describe('stepAdvanceHaptic', () => {
  it('fires selectionAsync', () => {
    stepAdvanceHaptic();
    expect(mockSelection).toHaveBeenCalledTimes(1);
  });
});
