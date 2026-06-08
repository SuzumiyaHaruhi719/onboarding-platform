import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { requireEditor } from '$lib/server/guard';
import { createQuiz, updateQuiz, deleteQuiz } from '$lib/server/editor';
import { quizInputSchema } from '$lib/server/schemas';

const id = z.string().min(1).max(100);

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const parsed = z
		.object({ sectionId: id, quiz: quizInputSchema })
		.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });
	return json({ ok: true, id: createQuiz(parsed.data.sectionId, parsed.data.quiz) });
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

export const DELETE: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const parsed = z.object({ id }).safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });
	deleteQuiz(parsed.data.id);
	return json({ ok: true });
};
