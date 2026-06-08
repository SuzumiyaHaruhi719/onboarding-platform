import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '$lib/db';
import { mergeIntervals, sanitizeIntervals } from '$lib/anti-skip/intervals';
import { evaluateCompletion } from '$lib/anti-skip/rules';
import type { CompletionResult, VideoInterval } from '$lib/anti-skip/types';
import {
	MAX_CREDIT_WINDOW_MS,
	QUIZ_MAX_ATTEMPTS,
	QUIZ_COOLDOWN_MS,
	VIDEO_START_EPS
} from '$lib/anti-skip/constants';

// CONCURRENCY INVARIANT: every mutating function below performs its read →
// compute → write synchronously with NO `await` in between. On single-threaded
// Node with synchronous better-sqlite3, that makes each one atomic relative to
// other requests (the event loop cannot interleave them). Do NOT introduce an
// `await` mid-function — if you must, wrap the read+write in `db.transaction`.

/** End of the watched [0, end] prefix (0 if playback never started near 0). */
function prefixEnd(intervals: VideoInterval[]): number {
	const merged = mergeIntervals(intervals);
	const first = merged[0];
	return first && first.start <= VIDEO_START_EPS ? first.end : 0;
}
import { getSectionView, getQuizAnswers, orderedSectionIds } from '$lib/db/queries';
import { parseIntervals, parseStringArray } from '$lib/db/serde';
import { gradeQuiz } from '$lib/quiz/grade';

type ProgressRow = typeof schema.progress.$inferSelect;

function whereRow(userId: string, sectionId: string) {
	return and(eq(schema.progress.userId, userId), eq(schema.progress.sectionId, sectionId));
}

function getRow(userId: string, sectionId: string): ProgressRow | undefined {
	return db.select().from(schema.progress).where(whereRow(userId, sectionId)).get();
}

export function startSection(userId: string, sectionId: string): ProgressRow {
	const existing = getRow(userId, sectionId);
	if (existing) return existing;
	db.insert(schema.progress)
		.values({ id: randomUUID(), userId, sectionId, status: 'in_progress', startedAt: Date.now() })
		.onConflictDoNothing()
		.run();
	return getRow(userId, sectionId)!;
}

/** A section is unlocked only when the previous section (global order) is completed. */
export function isUnlocked(userId: string, sectionId: string): boolean {
	const ids = orderedSectionIds();
	const idx = ids.indexOf(sectionId);
	if (idx < 0) return false;
	if (idx === 0) return true;
	const prev = getRow(userId, ids[idx - 1]!);
	return prev?.status === 'completed';
}

export interface HeartbeatInput {
	scrolledToBottom: boolean;
	dwellMs: number;
	videoIntervals: VideoInterval[];
}

/**
 * Fold a client heartbeat into durable server state. Monotonic and rate-capped:
 * progress can only grow, and each beat credits at most one window of dwell.
 */
export function applyHeartbeat(userId: string, sectionId: string, hb: HeartbeatInput): void {
	const view = getSectionView(sectionId);
	const r = startSection(userId, sectionId);
	const now = Date.now();

	const base = r.lastHeartbeatAt ?? r.startedAt;
	const windowMs = Math.min(Math.max(0, now - base), MAX_CREDIT_WINDOW_MS);

	// Dwell: credit only the bounded growth since last beat (never decreases).
	const claimedDelta = Math.max(0, hb.dwellMs - r.dwellMs);
	const dwellMs = r.dwellMs + Math.min(claimedDelta, windowMs);

	// Scroll: monotonic OR.
	const scrolledToBottom = r.scrolledToBottom === 1 || hb.scrolledToBottom ? 1 : 0;

	// Video: credit only the forward prefix growth allowed by elapsed time since
	// the last beat (same rate-cap as dwell). No-seek playback always yields a
	// [0, end] prefix, so store it normalized as a single interval. This blocks
	// the "wait long enough, then POST {0,duration}" forgery.
	const maxEnd = view?.requirements.videoDurationSec ?? 0;
	const windowSec = windowMs / 1000;
	const storedEnd = prefixEnd(parseIntervals(r.videoIntervals));
	const clientEnd = prefixEnd(sanitizeIntervals(hb.videoIntervals, maxEnd));
	const creditedEnd = Math.min(
		maxEnd,
		storedEnd + Math.max(0, Math.min(clientEnd - storedEnd, windowSec))
	);
	const videoIntervals = creditedEnd > 0 ? JSON.stringify([{ start: 0, end: creditedEnd }]) : '[]';

	db.update(schema.progress)
		.set({ dwellMs, scrolledToBottom, videoIntervals, lastHeartbeatAt: now })
		.where(whereRow(userId, sectionId))
		.run();
}

export interface QuizSubmitResult {
	passed: boolean;
	locked: boolean;
}

/**
 * Grade ONE quiz (inline, per-question). Correct answers accumulate in
 * `quizPassedIds`; the section's quiz requirement is met once every quiz in it
 * is passed (computed fresh in `attemptComplete`). Attempt limiting + cooldown
 * stay section-wide to throttle brute-forcing across all of a section's quizzes.
 */
export function submitQuiz(
	userId: string,
	sectionId: string,
	quizId: string,
	answer: unknown
): QuizSubmitResult {
	const r = startSection(userId, sectionId);
	const now = Date.now();

	const passedIds = parseStringArray(r.quizPassedIds);
	if (r.quizLockedUntil && r.quizLockedUntil > now) {
		return { passed: passedIds.includes(quizId), locked: true };
	}

	const key = getQuizAnswers(sectionId).find((q) => q.id === quizId);
	const correct = !!key && gradeQuiz(key.type, key.answer, answer, key.optionCount);

	if (correct) {
		// Record the pass but DON'T refund the section-wide attempt budget: resetting
		// quizAttempts on each per-quiz success would let a learner brute-force small
		// (boolean/single) quizzes indefinitely, since every lucky guess clears the
		// failure count. Wrong answers still accumulate toward the cap below.
		const nextPassed = passedIds.includes(quizId) ? passedIds : [...passedIds, quizId];
		db.update(schema.progress)
			.set({ quizPassedIds: JSON.stringify(nextPassed) })
			.where(whereRow(userId, sectionId))
			.run();
		return { passed: true, locked: false };
	}

	const attempts = r.quizAttempts + 1;
	const locked = attempts >= QUIZ_MAX_ATTEMPTS;
	db.update(schema.progress)
		.set({
			quizAttempts: locked ? 0 : attempts,
			quizLockedUntil: locked ? now + QUIZ_COOLDOWN_MS : r.quizLockedUntil
		})
		.where(whereRow(userId, sectionId))
		.run();
	return { passed: false, locked };
}

/** All of a section's quizzes passed? (vacuously true when there are none.) */
function allQuizzesPassed(sectionId: string, quizPassedIds: string): boolean {
	const ids = getQuizAnswers(sectionId).map((q) => q.id);
	if (ids.length === 0) return true;
	const passed = new Set(parseStringArray(quizPassedIds));
	return ids.every((id) => passed.has(id));
}

export type CompleteResult = CompletionResult & { nextId: string | null };

function nextSectionId(sectionId: string): string | null {
	const ids = orderedSectionIds();
	const idx = ids.indexOf(sectionId);
	return idx >= 0 && idx < ids.length - 1 ? ids[idx + 1]! : null;
}

/**
 * Idempotent: safe to poll. Finalizes the section the moment server-validated
 * requirements are met; once completed it returns early without rewriting state.
 */
export function attemptComplete(userId: string, sectionId: string): CompleteResult {
	const view = getSectionView(sectionId);
	if (!view) return { complete: false, reasons: ['scroll'], nextId: null };

	const r = startSection(userId, sectionId);
	if (r.status === 'completed') {
		return { complete: true, reasons: [], nextId: nextSectionId(sectionId) };
	}

	const maxEnd = view.requirements.videoDurationSec ?? 0;
	const now = Date.now();
	const result = evaluateCompletion(
		{
			scrolledToBottom: r.scrolledToBottom === 1,
			dwellMs: r.dwellMs,
			videoIntervals: sanitizeIntervals(parseIntervals(r.videoIntervals), maxEnd),
			quizPassed: allQuizzesPassed(sectionId, r.quizPassedIds),
			elapsedMs: now - r.startedAt
		},
		view.requirements
	);

	let nextId: string | null = null;
	if (result.complete) {
		db.update(schema.progress)
			.set({ status: 'completed', completedAt: now, readPct: 1 })
			.where(whereRow(userId, sectionId))
			.run();
		nextId = nextSectionId(sectionId);
	}

	return { ...result, nextId };
}

export function progressMap(userId: string): Record<string, string> {
	const rows = db.select().from(schema.progress).where(eq(schema.progress.userId, userId)).all();
	return Object.fromEntries(rows.map((r) => [r.sectionId, r.status]));
}
