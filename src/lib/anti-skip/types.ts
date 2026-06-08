export interface VideoInterval {
	/** seconds */
	start: number;
	/** seconds */
	end: number;
}

/** Server-accumulated reading state for one user+section. */
export interface ReadingState {
	scrolledToBottom: boolean;
	dwellMs: number;
	videoIntervals: VideoInterval[];
	quizPassed: boolean;
	/** Wall-clock ms since the section was first started (server-measured). */
	elapsedMs: number;
}

export interface SectionRequirements {
	minDwellMs: number;
	hasVideo: boolean;
	videoDurationSec: number | null;
	hasQuiz: boolean;
	/** 0..1 — fraction of the video that must be continuously covered. */
	videoCoverageThreshold: number;
}

export type UnmetReason = 'scroll' | 'dwell' | 'video' | 'quiz';

export interface CompletionResult {
	complete: boolean;
	reasons: UnmetReason[];
}
