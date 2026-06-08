import { randomUUID } from 'node:crypto';
import { eq, asc, sql } from 'drizzle-orm';
import { db, schema } from '$lib/db';
import { parseOptions, parseAnswer, parseBlockData } from '$lib/db/serde';
import type { BlockInput, QuizInput, EditorQuiz } from '$lib/content/types';

/** Quizzes WITH correct answers — editor-only read model. */
export function getEditorQuizzes(sectionId: string): EditorQuiz[] {
	return db
		.select()
		.from(schema.quizzes)
		.where(eq(schema.quizzes.sectionId, sectionId))
		.orderBy(asc(schema.quizzes.order), asc(schema.quizzes.id))
		.all()
		.map((q) => ({
			id: q.id,
			order: q.order,
			type: q.type,
			question: q.question,
			options: parseOptions(q.options),
			answer: parseAnswer(q.answer)
		}));
}

function nextSectionOrder(moduleId: string): number {
	const r = db
		.select({ max: sql<number | null>`max(${schema.sections.order})` })
		.from(schema.sections)
		.where(eq(schema.sections.moduleId, moduleId))
		.get();
	return (r?.max ?? -1) + 1;
}
function nextBlockOrder(sectionId: string): number {
	const r = db
		.select({ max: sql<number | null>`max(${schema.blocks.order})` })
		.from(schema.blocks)
		.where(eq(schema.blocks.sectionId, sectionId))
		.get();
	return (r?.max ?? -1) + 1;
}
function nextQuizOrder(sectionId: string): number {
	const r = db
		.select({ max: sql<number | null>`max(${schema.quizzes.order})` })
		.from(schema.quizzes)
		.where(eq(schema.quizzes.sectionId, sectionId))
		.get();
	return (r?.max ?? -1) + 1;
}

// ---- Modules ----
export function createModule(title: string): string {
	const id = randomUUID();
	const r = db.select({ max: sql<number | null>`max(${schema.modules.order})` }).from(schema.modules).get();
	db.insert(schema.modules).values({ id, title, order: (r?.max ?? -1) + 1 }).run();
	return id;
}

export function deleteModule(id: string): void {
	const secs = db
		.select({ id: schema.sections.id })
		.from(schema.sections)
		.where(eq(schema.sections.moduleId, id))
		.all();
	for (const s of secs) deleteSection(s.id);
	db.delete(schema.modules).where(eq(schema.modules.id, id)).run();
}

// ---- Sections ----
export function createSection(moduleId: string, title: string): string {
	const id = randomUUID();
	db.insert(schema.sections)
		.values({ id, moduleId, title, order: nextSectionOrder(moduleId), minDwellMs: 5000 })
		.run();
	return id;
}

export function updateSection(id: string, patch: { title?: string; minDwellMs?: number }): void {
	db.update(schema.sections).set(patch).where(eq(schema.sections.id, id)).run();
}

export function deleteSection(id: string): void {
	db.delete(schema.quizzes).where(eq(schema.quizzes.sectionId, id)).run();
	db.delete(schema.blocks).where(eq(schema.blocks.sectionId, id)).run();
	db.delete(schema.progress).where(eq(schema.progress.sectionId, id)).run();
	db.delete(schema.sections).where(eq(schema.sections.id, id)).run();
}

// ---- Blocks ----
export function createBlock(sectionId: string, block: BlockInput): string {
	const id = randomUUID();
	db.insert(schema.blocks)
		.values({ id, sectionId, type: block.type, order: nextBlockOrder(sectionId), content: JSON.stringify(block) })
		.run();
	return id;
}

export function updateBlock(id: string, block: BlockInput): void {
	// Quiz blocks own a quiz row 1:1 and are edited via updateQuiz — never the
	// generic path (which would orphan the quiz row or break the link).
	if (block.type === 'quiz') return;
	const existing = db
		.select({ type: schema.blocks.type })
		.from(schema.blocks)
		.where(eq(schema.blocks.id, id))
		.get();
	if (existing?.type === 'quiz') return;
	db.update(schema.blocks)
		.set({ type: block.type, content: JSON.stringify(block) })
		.where(eq(schema.blocks.id, id))
		.run();
}

export function deleteBlock(id: string): void {
	// A quiz block owns its quiz row 1:1 — cascade so no orphan quiz keeps
	// gating the section (which would soft-lock learners with no way to answer).
	const row = db.select().from(schema.blocks).where(eq(schema.blocks.id, id)).get();
	if (row?.type === 'quiz') {
		const data = parseBlockData(row.content);
		const quizId = data && typeof data.quizId === 'string' ? data.quizId : null;
		if (quizId) db.delete(schema.quizzes).where(eq(schema.quizzes.id, quizId)).run();
	}
	db.delete(schema.blocks).where(eq(schema.blocks.id, id)).run();
}

/** Reassign block order to match the given id sequence (within one section). */
export function reorderBlocks(orderedIds: string[]): void {
	db.transaction((tx) => {
		orderedIds.forEach((id, i) => {
			tx.update(schema.blocks).set({ order: i }).where(eq(schema.blocks.id, id)).run();
		});
	});
}

function listSectionBlockIds(sectionId: string): string[] {
	return db
		.select({ id: schema.blocks.id })
		.from(schema.blocks)
		.where(eq(schema.blocks.sectionId, sectionId))
		.orderBy(asc(schema.blocks.order), asc(schema.blocks.id))
		.all()
		.map((r) => r.id);
}

export type InsertPosition = 'start' | 'end' | { afterId: string };

/** Create multiple blocks then move them to the chosen position. Returns count. */
export function insertBlocksAt(sectionId: string, blocks: BlockInput[], position: InsertPosition): number {
	if (blocks.length === 0) return 0;
	const newIds = blocks.map((b) => createBlock(sectionId, b)); // appended in order
	if (position === 'end') return blocks.length;

	const all = listSectionBlockIds(sectionId);
	const isNew = new Set(newIds);
	const old = all.filter((id) => !isNew.has(id));
	let desired: string[];
	if (position === 'start') {
		desired = [...newIds, ...old];
	} else {
		const idx = old.indexOf(position.afterId);
		desired = idx < 0 ? [...old, ...newIds] : [...old.slice(0, idx + 1), ...newIds, ...old.slice(idx + 1)];
	}
	reorderBlocks(desired);
	return blocks.length;
}

// ---- Quizzes ----
/**
 * Author a quiz inline: create the quiz row AND its quiz block (linked by
 * quizId) at the chosen position, in lockstep. This replaces the old
 * "quiz bank + generic 题目区 placeholder" two-step model.
 */
export function insertQuizBlock(
	sectionId: string,
	quiz: QuizInput,
	position: InsertPosition
): { quizId: string; count: number } {
	const quizId = createQuiz(sectionId, quiz);
	const count = insertBlocksAt(sectionId, [{ type: 'quiz', quizId }], position);
	return { quizId, count };
}

function createQuiz(sectionId: string, quiz: QuizInput): string {
	const id = randomUUID();
	db.insert(schema.quizzes)
		.values({
			id,
			sectionId,
			order: nextQuizOrder(sectionId),
			type: quiz.type,
			question: quiz.question,
			options: JSON.stringify(quiz.options),
			answer: JSON.stringify(quiz.answer)
		})
		.run();
	return id;
}

export function updateQuiz(id: string, quiz: QuizInput): void {
	db.update(schema.quizzes)
		.set({
			type: quiz.type,
			question: quiz.question,
			options: JSON.stringify(quiz.options),
			answer: JSON.stringify(quiz.answer)
		})
		.where(eq(schema.quizzes.id, id))
		.run();
}


// ---- Editor read model ----
export interface EditorSectionSummary {
	id: string;
	title: string;
	order: number;
	minDwellMs: number;
	blockCount: number;
	quizCount: number;
}

export interface EditorModule {
	id: string;
	title: string;
	order: number;
	sections: EditorSectionSummary[];
}

function countRows(table: typeof schema.blocks | typeof schema.quizzes, sectionId: string): number {
	const row = db
		.select({ count: sql<number>`count(*)` })
		.from(table)
		.where(eq(table.sectionId, sectionId))
		.get();
	return Number(row?.count ?? 0);
}

export function listAllModules(): EditorModule[] {
	return db
		.select()
		.from(schema.modules)
		.orderBy(asc(schema.modules.order))
		.all()
		.map((m) => ({
			id: m.id,
			title: m.title,
			order: m.order,
			sections: db
				.select({
					id: schema.sections.id,
					title: schema.sections.title,
					order: schema.sections.order,
					minDwellMs: schema.sections.minDwellMs
				})
				.from(schema.sections)
				.where(eq(schema.sections.moduleId, m.id))
				.orderBy(asc(schema.sections.order), asc(schema.sections.id))
				.all()
				.map((s) => ({
					...s,
					blockCount: countRows(schema.blocks, s.id),
					quizCount: countRows(schema.quizzes, s.id)
				}))
		}));
}
