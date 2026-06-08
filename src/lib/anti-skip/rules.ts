import type { ReadingState, SectionRequirements, CompletionResult, UnmetReason } from './types';
import { coversPrefix, coveredSeconds } from './intervals';
import { VIDEO_START_EPS, VIDEO_RATE_TOLERANCE } from './constants';

/**
 * Server-authoritative completion check. Operates purely on server-accumulated
 * state — never on raw client claims.
 */
export function evaluateCompletion(
	state: ReadingState,
	req: SectionRequirements
): CompletionResult {
	const reasons: UnmetReason[] = [];

	if (!state.scrolledToBottom) reasons.push('scroll');
	if (state.dwellMs < req.minDwellMs) reasons.push('dwell');

	if (req.hasVideo) {
		const duration = req.videoDurationSec ?? 0;
		const contiguous = coversPrefix(
			state.videoIntervals,
			duration,
			req.videoCoverageThreshold,
			VIDEO_START_EPS
		);
		// Can't have watched more video seconds than real wall-clock time elapsed.
		const plausible =
			coveredSeconds(state.videoIntervals) <= (state.elapsedMs / 1000) * VIDEO_RATE_TOLERANCE;
		if (!contiguous || !plausible) reasons.push('video');
	}

	if (req.hasQuiz && !state.quizPassed) reasons.push('quiz');

	return { complete: reasons.length === 0, reasons };
}
