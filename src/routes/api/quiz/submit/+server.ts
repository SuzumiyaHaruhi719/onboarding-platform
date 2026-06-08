import { json, type RequestHandler } from '@sveltejs/kit';
import { submitQuiz, isUnlocked } from '$lib/server/progress';
import { quizSubmitSchema } from '$lib/server/schemas';

export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = quizSubmitSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });

	const { sectionId, quizId, answer } = parsed.data;
	if (!isUnlocked(locals.uid, sectionId)) return json({ ok: false }, { status: 403 });

	return json({ ok: true, ...submitQuiz(locals.uid, sectionId, quizId, answer) });
};
