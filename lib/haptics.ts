import * as Haptics from 'expo-haptics';

// Right swipe = single Medium thump. Confident "yes / saved" commit.
// Light was too subtle for a kitchen environment; Medium is the iOS standard
// for button-activated feedback.
export function rightSwipeHaptic(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

// Left swipe = two Rigid taps ~60 ms apart. Rigid is sharper/shorter than
// Light, so the double reads as a deliberate "nope-nope" rather than tic-tic.
export function leftSwipeHaptic(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
  setTimeout(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
  }, 60);
}

// Cooking step timer reaching 0. Notification.Success is iOS's three-pulse
// "ding" — distinctive enough to feel from across the kitchen.
export function timerDoneHaptic(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

// Cheap selection tick when advancing/retreating cooking steps.
export function stepAdvanceHaptic(): void {
  Haptics.selectionAsync().catch(() => {});
}
