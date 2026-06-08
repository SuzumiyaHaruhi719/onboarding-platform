import type { VideoInterval } from '$lib/anti-skip/types';

/** Centralized, defensive JSON parsing for DB text columns. */
function safeParse(json: string): unknown {
	try {
		return JSON.parse(json);
	} catch {
		return null;
	}
}

export function parseIntervals(json: string): VideoInterval[] {
	const v = safeParse(json);
	if (!Array.isArray(v)) return [];
	return v.filter(
		(i): i is VideoInterval =>
			!!i &&
			typeof i === 'object' &&
			Number.isFinite((i as VideoInterval).start) &&
			Number.isFinite((i as VideoInterval).end)
	);
}

/** Block data object stored in `blocks.content` (without the row id). */
export function parseBlockData(json: string): Record<string, unknown> | null {
	const v = safeParse(json);
	if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
	return v as Record<string, unknown>;
}

export function parseOptions(json: string): string[] {
	const v = safeParse(json);
	if (!Array.isArray(v)) return [];
	return v.map((o) => String(o));
}

/** Parse a JSON string[] column (e.g. progress.quizPassedIds); tolerant of junk. */
export function parseStringArray(json: string): string[] {
	const v = safeParse(json);
	if (!Array.isArray(v)) return [];
	return v.filter((s): s is string => typeof s === 'string');
}

export type QuizAnswer = number | number[] | boolean;

export function parseAnswer(json: string): QuizAnswer {
	const v = safeParse(json);
	if (typeof v === 'boolean' || typeof v === 'number') return v;
	if (Array.isArray(v)) return v.filter((n): n is number => typeof n === 'number');
	return false;
}
