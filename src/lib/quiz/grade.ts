import type { QuizType } from '$lib/content/types';

function isIntInRange(v: unknown, count: number | undefined): v is number {
	if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return false;
	return count === undefined || v < count;
}

/**
 * Grade one quiz answer. Pure and strict — used server-side as the authoritative
 * judge. `optionCount` (when known) rejects out-of-range indices.
 */
export function gradeQuiz(
	type: QuizType,
	answer: unknown,
	submitted: unknown,
	optionCount?: number
): boolean {
	if (type === 'single') {
		return isIntInRange(submitted, optionCount) && submitted === answer;
	}
	if (type === 'boolean') {
		return typeof submitted === 'boolean' && submitted === answer;
	}
	if (type === 'multiple') {
		if (!Array.isArray(submitted) || !Array.isArray(answer)) return false;
		// Every submitted item must be a valid, unique index.
		const seen = new Set<number>();
		for (const item of submitted) {
			if (!isIntInRange(item, optionCount)) return false;
			if (seen.has(item)) return false;
			seen.add(item);
		}
		const a = [...(submitted as number[])].sort((x, y) => x - y);
		const b = [...(answer as number[])].sort((x, y) => x - y);
		return a.length === b.length && a.every((v, i) => v === b[i]);
	}
	return false;
}
