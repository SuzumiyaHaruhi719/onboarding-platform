import { error } from '@sveltejs/kit';
import { eq, asc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db, schema } from '$lib/db';
import { parseBlockData, parseOptions, parseAnswer } from '$lib/db/serde';
import type { Block, EditorQuiz } from '$lib/content/types';

export const load: PageServerLoad = ({ params }) => {
	const s = db.select().from(schema.sections).where(eq(schema.sections.id, params.id)).get();
	if (!s) error(404, '章节不存在 / Section not found');

	const blockRows = db
		.select()
		.from(schema.blocks)
		.where(eq(schema.blocks.sectionId, s.id))
		.orderBy(asc(schema.blocks.order), asc(schema.blocks.id))
		.all();
	const blocks: Block[] = [];
	for (const b of blockRows) {
		const d = parseBlockData(b.content);
		if (d) blocks.push({ id: b.id, ...d } as Block);
	}

	const quizzes: EditorQuiz[] = db
		.select()
		.from(schema.quizzes)
		.where(eq(schema.quizzes.sectionId, s.id))
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

	return { section: { id: s.id, title: s.title, minDwellMs: s.minDwellMs }, blocks, quizzes };
};
