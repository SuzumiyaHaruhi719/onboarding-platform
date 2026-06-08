import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { requireEditor } from '$lib/server/guard';
import { insertQuizBlock, updateQuiz } from '$lib/server/editor';
import { quizInputSchema, insertQuizBlockSchema } from '$lib/server/schemas';

const id = z.string().min(1).max(100);

// Author a quiz inline: creates the quiz + its quiz block at the given position.
export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const parsed = insertQuizBlockSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });
	const { sectionId, quiz, position } = parsed.data;
	return json({ ok: true, ...insertQuizBlock(sectionId, quiz, position) });
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const parsed = z
		.object({ id, quiz: quizInputSchema })
		.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });
	updateQuiz(parsed.data.id, parsed.data.quiz);
	return json({ ok: true });
};
// Quiz deletion goes through the block DELETE endpoint (deleteBlock cascades to
// the owned quiz row), keeping the quiz↔block 1:1 invariant intact.
