/** Client heartbeat cadence. */
export const HEARTBEAT_MS = 4000;

/** Max reading/video time credited per heartbeat — bounds client forgery. */
export const MAX_CREDIT_WINDOW_MS = 15000;

/** Fraction of the video that must be continuously watched. */
export const VIDEO_COVERAGE_THRESHOLD = 0.95;

/** Tolerance (seconds) for the watched interval to start near 0. */
export const VIDEO_START_EPS = 1.0;

/** Covered video seconds must not exceed wall-clock seconds * this factor. */
export const VIDEO_RATE_TOLERANCE = 1.25;

/** Max single forward credit per video time-update (seconds). */
export const VIDEO_MAX_STEP_SEC = 1.5;

/** Quiz attempts before a cooldown kicks in. */
export const QUIZ_MAX_ATTEMPTS = 5;

/** Cooldown duration after too many wrong quiz attempts. */
export const QUIZ_COOLDOWN_MS = 30000;
