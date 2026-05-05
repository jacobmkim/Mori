import { Audio } from 'expo-av';

// Lazy-loaded Sound instance — created on first call, replayed on subsequent
// calls so we avoid repeated decode cost. Fire-and-forget; failures are
// silently swallowed (we don't want a missing asset or audio-session quirk
// to break the cook flow).
let chime: Audio.Sound | null = null;
let loading = false;

async function ensureLoaded(): Promise<Audio.Sound | null> {
  if (chime) return chime;
  if (loading) return null;
  loading = true;
  try {
    // Configure audio session so the chime plays even if the device is in
    // silent mode (kitchen scenario — phone often face-down on a counter).
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    const { sound } = await Audio.Sound.createAsync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../assets/sounds/timer-done.wav'),
      { shouldPlay: false, volume: 1.0 }
    );
    chime = sound;
    return chime;
  } catch {
    return null;
  } finally {
    loading = false;
  }
}

export function playTimerChime(): void {
  ensureLoaded().then((sound) => {
    if (!sound) return;
    sound.replayAsync().catch(() => {});
  }).catch(() => {});
}

export async function unloadTimerChime(): Promise<void> {
  if (!chime) return;
  try { await chime.unloadAsync(); } catch { /* noop */ }
  chime = null;
}
