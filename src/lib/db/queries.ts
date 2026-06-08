import { eq, asc } from 'drizzle-orm';
import { db, schema } from './index';
import type { Block, QuizData, QuizType, SectionView } from '$lib/content/types';
import { parseBlockData, parseOptions, parseAnswer, type QuizAnswer } from './serde';
import { VIDEO_COVERAGE_THRESHOLD } from '$lib/anti-skip/constants';

export interface SectionSummary {
	id: string;
	title: string;
	order: number;
}

export interface ModuleWithSections {
	id: string;
	title: string;
	order: number;
	sections: SectionSummary[];
}

export function listModulesWithSections(): ModuleWithSections[] {
	const mods = db.select().from(schema.modules).orderBy(asc(schema.modules.order)).all();
	return mods.map((m) => ({
		id: m.id,
		title: m.title,
		order: m.order,
		sections: db
			.select({
				id: schema.sections.id,
				title: schema.sections.title,
				order: schema.sections.order
			})
			.from(schema.sections)
			.where(eq(schema.sections.moduleId, m.id))
			.orderBy(asc(schema.sections.order), asc(schema.sections.id))
			.all()
	}));
}

/** Global learning order across modules — one ordered query, stable tie-breakers. */
export function orderedSectionIds(): string[] {
	return db
		.select({ id: schema.sections.id })
		.from(schema.sections)
		.innerJoin(schema.modules, eq(schema.sections.moduleId, schema.modules.id))
		.orderBy(asc(schema.modules.order), asc(schema.sections.order), asc(schema.sections.id))
		.all()
		.map((r) => r.id);
}

export function getSectionView(sectionId: string): SectionView | null {
	const s = db.select().from(schema.sections).where(eq(schema.sections.id, sectionId)).get();
	if (!s) return null;

	const blockRows = db
		.select()
		.from(schema.blocks)
		.where(eq(schema.blocks.sectionId, sectionId))
		.orderBy(asc(schema.blocks.order), asc(schema.blocks.id))
		.all();

	const blocks: Block[] = [];
	for (const b of blockRows) {
		const data = parseBlockData(b.content);
		if (!data) continue;
		blocks.push({ id: b.id, ...data } as Block);
	}

	const quizRows = db
		.select()
		.from(schema.quizzes)
		.where(eq(schema.quizzes.sectionId, sectionId))
		.orderBy(asc(schema.quizzes.order), asc(schema.quizzes.id))
		.all();

	const quizzes: QuizData[] = quizRows.map((q) => ({
		id: q.id,
		order: q.order,
		type: q.type,
		question: q.question,
		options: parseOptions(q.options)
	}));

	// P1 constraint: at most one video per section. The first video defines the
	// completion requirement; the learner page tracks a single video timeline.
	const videoBlock = blocks.find(
		(b): b is Extract<Block, { type: 'video' }> => b.type === 'video'
	);

	return {
		id: s.id,
		title: s.title,
		blocks,
		quizzes,
		requirements: {
			minDwellMs: s.minDwellMs,
			hasVideo: !!videoBlock,
			videoDurationSec: videoBlock ? videoBlock.durationSec : null,
			hasQuiz: quizzes.length > 0,
			videoCoverageThreshold: VIDEO_COVERAGE_THRESHOLD
		}
	};
}

export interface QuizKey {
	id: string;
	type: QuizType;
	answer: QuizAnswer;
	optionCount: number;
}

/** Server-only: correct answers for grading. Never expose to the client. */
export function getQuizAnswers(sectionId: string): QuizKey[] {
	return db
		.select()
		.from(schema.quizzes)
		.where(eq(schema.quizzes.sectionId, sectionId))
		.all()
		.map((q) => ({
			id: q.id,
			type: q.type,
			answer: parseAnswer(q.answer),
			optionCount: parseOptions(q.options).length
		}));
}
