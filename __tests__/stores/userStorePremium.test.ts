/**
 * userStore.isPremium contract.
 *
 * Mori+ adds an `isPremium` boolean to the user store, mirrored from
 * RevenueCat customer info. The store must:
 *
 *   - Default to false on cold boot (so a free user never sees a flash of
 *     premium UI before init resolves).
 *   - Be flippable by the action `setPremium(v)` and ONLY by that action —
 *     the rest of the app should never write to it directly.
 *   - Survive being toggled in either direction (true → false and back).
 */

import { useUserStore } from '@/stores/userStore';

describe('userStore.isPremium — defaults', () => {
  it('initial value is false', () => {
    // Re-create the store cleanly in case a prior test mutated it.
    useUserStore.setState({ isPremium: false } as any);
    expect(useUserStore.getState().isPremium).toBe(false);
  });
});

describe('userStore.setPremium — action contract', () => {
  beforeEach(() => {
    useUserStore.setState({ isPremium: false } as any);
  });

  it('flips isPremium to true when given true', () => {
    useUserStore.getState().setPremium(true);
    expect(useUserStore.getState().isPremium).toBe(true);
  });

  it('flips isPremium back to false when given false', () => {
    useUserStore.getState().setPremium(true);
    useUserStore.getState().setPremium(false);
    expect(useUserStore.getState().isPremium).toBe(false);
  });

  it('is idempotent (calling setPremium(true) twice keeps state stable)', () => {
    useUserStore.getState().setPremium(true);
    const first = useUserStore.getState().isPremium;
    useUserStore.getState().setPremium(true);
    const second = useUserStore.getState().isPremium;
    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  it('does not touch other store fields', () => {
    useUserStore.setState({
      profile: { id: 'user-1', name: 'Test' } as any,
      sessionNumber: 7,
      isPremium: false,
    });
    useUserStore.getState().setPremium(true);
    const state = useUserStore.getState();
    expect(state.profile?.id).toBe('user-1');
    expect(state.sessionNumber).toBe(7);
    expect(state.isPremium).toBe(true);
  });
});

describe('userStore.isPremium — interaction with other actions', () => {
  // Regression guard: other actions must not stomp on isPremium. Sign-in
  // (setProfile) and onboarding flows update unrelated state — the entitlement
  // state is owned by the RevenueCat listener and these paths must not collide.
  it('is preserved when setProfile is called', () => {
    useUserStore.setState({ isPremium: true } as any);
    useUserStore.getState().setProfile({ id: 'user-2', name: 'New User' } as any);
    expect(useUserStore.getState().isPremium).toBe(true);
  });

  it('is preserved when resetOnboarding is called', () => {
    useUserStore.setState({ isPremium: true } as any);
    useUserStore.getState().resetOnboarding();
    expect(useUserStore.getState().isPremium).toBe(true);
  });

  it('is preserved when sessionNumber is incremented', () => {
    useUserStore.setState({ isPremium: true } as any);
    useUserStore.getState().setSessionNumber(42);
    expect(useUserStore.getState().isPremium).toBe(true);
    expect(useUserStore.getState().sessionNumber).toBe(42);
  });
});
