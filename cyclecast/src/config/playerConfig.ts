export const PLAYBACK_RATES = [1.0, 1.25, 1.5, 1.75, 2.0];

export const SKIP_MODES = ['chapter', 'podcast'] as const;
export type SkipMode = typeof SKIP_MODES[number];

export const DEFAULT_SKIP = { rewind: 15, forward: 30 };
