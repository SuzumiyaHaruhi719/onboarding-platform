import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '$lib/db';
import { mergeIntervals, sanitizeIntervals } from '$lib/anti-skip/intervals';
import { evaluateCompletion } from '$lib/anti-skip/rules';
import type { CompletionResult, VideoInterval } from '$lib/anti-skip/types';
import {
	MAX_CREDIT_WINDOW_MS,
	QUIZ_MAX_ATTEMPTS,
	QUIZ_COOLDOWN_MS
} from '$lib/anti-skip/constants';
import { getSectionView, getQuizAnswers, orderedSectionIds } from '$lib/db/queries';
import { parseIntervals } from '$lib/db/serde';
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

	// Video: union of stored + sanitized client intervals (clamped to duration).
	const maxEnd = view?.requirements.videoDurationSec ?? 0;
	const merged = mergeIntervals([
		...parseIntervals(r.videoIntervals),
		...sanitizeIntervals(hb.videoIntervals, maxEnd)
	]);

	db.update(schema.progress)
		.set({
			dwellMs,
			scrolledToBottom,
			videoIntervals: JSON.stringify(merged),
			lastHeartbeatAt: now
		})
		.where(whereRow(userId, sectionId))
		.run();
}

export interface QuizSubmitResult {
	passed: boolean;
	locked: boolean;
}

export function submitQuiz(
	userId: string,
	sectionId: string,
	answers: Record<string, unknown>
): QuizSubmitResult {
	const r = startSection(userId, sectionId);
	const now = Date.now();

	if (r.quizLockedUntil && r.quizLockedUntil > now) {
		return { passed: r.quizPassed === 1, locked: true };
	}

	const keys = getQuizAnswers(sectionId);
	const allCorrect =
		keys.length > 0 &&
		keys.every((q) => gradeQuiz(q.type, q.answer, answers[q.id], q.optionCount));

	if (allCorrect) {
		db.update(schema.progress)
			.set({ quizPassed: 1, quizAttempts: 0, quizLockedUntil: null })
			.where(whereRow(userId, sectionId))
			.run();
		return { passed: true, locked: false };
	}

	const attempts = r.quizAttempts + 1;
	const locked = attempts >= QUIZ_MAX_ATTEMPTS;
	db.update(schema.progress)
		.set({
			quizPassed: 0,
			quizAttempts: locked ? 0 : attempts,
			quizLockedUntil: locked ? now + QUIZ_COOLDOWN_MS : r.quizLockedUntil
		})
		.where(whereRow(userId, sectionId))
		.run();
	return { passed: false, locked };
}

export type CompleteResult = CompletionResult & { nextId: string | null };

export function attemptComplete(userId: string, sectionId: string): CompleteResult {
	const view = getSectionView(sectionId);
	if (!view) return { complete: false, reasons: ['scroll'], nextId: null };

	startSection(userId, sectionId);
	const r = getRow(userId, sectionId)!; // re-read after ensuring the row exists
	const now = Date.now();

	const result = evaluateCompletion(
		{
			scrolledToBottom: r.scrolledToBottom === 1,
			dwellMs: r.dwellMs,
			videoIntervals: parseIntervals(r.videoIntervals),
			quizPassed: r.quizPassed === 1,
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
		const ids = orderedSectionIds();
		const idx = ids.indexOf(sectionId);
		nextId = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1]! : null;
	}

	return { ...result, nextId };
}

export function progressMap(userId: string): Record<string, string> {
	const rows = db.select().from(schema.progress).where(eq(schema.progress.userId, userId)).all();
	return Object.fromEntries(rows.map((r) => [r.sectionId, r.status]));
}
