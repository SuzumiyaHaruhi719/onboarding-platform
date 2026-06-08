import { describe, it, expect } from 'vitest';
import { evaluateCompletion } from './rules';
import type { ReadingState, SectionRequirements } from './types';

const reqAll: SectionRequirements = {
	minDwellMs: 1000,
	hasVideo: true,
	videoDurationSec: 10,
	hasQuiz: true,
	videoCoverageThreshold: 0.95
};

const full: ReadingState = {
	scrolledToBottom: true,
	dwellMs: 1200,
	videoIntervals: [{ start: 0, end: 10 }],
	quizPassed: true,
	elapsedMs: 12000
};

describe('evaluateCompletion', () => {
	it('全部满足 → complete', () => {
		expect(evaluateCompletion(full, reqAll)).toEqual({ complete: true, reasons: [] });
	});
	it('未滚到底 → scroll', () => {
		expect(evaluateCompletion({ ...full, scrolledToBottom: false }, reqAll).reasons).toContain(
			'scroll'
		);
	});
	it('停留不足 → dwell', () => {
		expect(evaluateCompletion({ ...full, dwellMs: 500 }, reqAll).reasons).toContain('dwell');
	});
	it('视频覆盖不足 → video', () => {
		expect(
			evaluateCompletion({ ...full, videoIntervals: [{ start: 0, end: 5 }] }, reqAll).reasons
		).toContain('video');
	});
	it('瞬时伪造满覆盖但墙钟不足 → video', () => {
		// covered 10s, but only 2s of real elapsed time → implausible
		expect(evaluateCompletion({ ...full, elapsedMs: 2000 }, reqAll).reasons).toContain('video');
	});
	it('题目未过 → quiz', () => {
		expect(evaluateCompletion({ ...full, quizPassed: false }, reqAll).reasons).toContain('quiz');
	});
	it('无视频无题目时忽略对应规则', () => {
		const req: SectionRequirements = {
			minDwellMs: 0,
			hasVideo: false,
			videoDurationSec: null,
			hasQuiz: false,
			videoCoverageThreshold: 0.95
		};
		const st: ReadingState = {
			scrolledToBottom: true,
			dwellMs: 0,
			videoIntervals: [],
			quizPassed: false,
			elapsedMs: 0
		};
		expect(evaluateCompletion(st, req).complete).toBe(true);
	});
});
