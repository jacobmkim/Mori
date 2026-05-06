// Feature flags driven by EAS env. Read at module load — flipping a flag
// requires either an OTA push (for EXPO_PUBLIC_* vars baked at bundle time)
// or a full rebuild. See eas.json for pinned values per profile.
//
// Add a new flag by: (1) defining it in EAS env, (2) reading it here,
// (3) pinning the production default in eas.json so it's source-controlled.

export const flags = {
  // Master kill switch for all Mori+ surfaces. Ship v1.1 with this OFF;
  // flip to 'true' on launch day via EAS env update + OTA push.
  moriPlusEnabled: process.env.EXPO_PUBLIC_MORI_PLUS_ENABLED === 'true',
};
