import { randomUUID } from 'node:crypto';
import { eq, asc, sql } from 'drizzle-orm';
import { db, schema } from '$lib/db';
import type { BlockInput, QuizInput } from '$lib/content/types';

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
	db.update(schema.blocks)
		.set({ type: block.type, content: JSON.stringify(block) })
		.where(eq(schema.blocks.id, id))
		.run();
}

export function deleteBlock(id: string): void {
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

// ---- Quizzes ----
export function createQuiz(sectionId: string, quiz: QuizInput): string {
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

export function deleteQuiz(id: string): void {
	db.delete(schema.quizzes).where(eq(schema.quizzes.id, id)).run();
}

// ---- Editor read model ----
export interface EditorModule {
	id: string;
	title: string;
	order: number;
	sections: { id: string; title: string; order: number; minDwellMs: number }[];
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
		}));
}
