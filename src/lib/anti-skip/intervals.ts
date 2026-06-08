import type { VideoInterval } from './types';

/** Drop invalid intervals (NaN/Infinity/reversed/negative) and clamp to [0, maxEnd]. */
export function sanitizeIntervals(input: unknown, maxEnd: number): VideoInterval[] {
	if (!Array.isArray(input)) return [];
	const out: VideoInterval[] = [];
	for (const raw of input) {
		if (!raw || typeof raw !== 'object') continue;
		const start = (raw as VideoInterval).start;
		const end = (raw as VideoInterval).end;
		if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
		const s = Math.max(0, start);
		const e = Math.min(maxEnd, end);
		if (e > s) out.push({ start: s, end: e });
	}
	return out;
}

/** Merge overlapping/adjacent intervals into a minimal sorted set. */
export function mergeIntervals(input: VideoInterval[]): VideoInterval[] {
	if (input.length === 0) return [];
	const sorted = [...input].sort((a, b) => a.start - b.start);
	const first = sorted[0]!;
	const out: VideoInterval[] = [{ start: first.start, end: first.end }];
	for (let i = 1; i < sorted.length; i++) {
		const cur = sorted[i]!;
		const last = out[out.length - 1]!;
		if (cur.start <= last.end) last.end = Math.max(last.end, cur.end);
		else out.push({ start: cur.start, end: cur.end });
	}
	return out;
}

/** Total unique seconds covered. */
export function coveredSeconds(intervals: VideoInterval[]): number {
	return mergeIntervals(intervals).reduce((sum, i) => sum + (i.end - i.start), 0);
}

export function coverageRatio(intervals: VideoInterval[], durationSec: number): number {
	if (durationSec <= 0) return 0;
	return Math.min(1, coveredSeconds(intervals) / durationSec);
}

/**
 * True when a single merged interval continuously covers the video from ~0 to
 * at least `duration * threshold`. With no-seek playback the watched range grows
 * as one block from 0, so a prefix check rejects spliced/synthetic coverage.
 */
export function coversPrefix(
	intervals: VideoInterval[],
	durationSec: number,
	threshold: number,
	startEps: number
): boolean {
	if (durationSec <= 0) return true;
	const merged = mergeIntervals(intervals);
	const first = merged[0];
	return !!first && first.start <= startEps && first.end >= durationSec * threshold;
}
