import { json, type RequestHandler } from '@sveltejs/kit';
import { attemptComplete, isUnlocked } from '$lib/server/progress';
import { completeSchema } from '$lib/server/schemas';

export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = completeSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });

	const { sectionId } = parsed.data;
	if (!isUnlocked(locals.uid, sectionId)) return json({ ok: false }, { status: 403 });

	return json(attemptComplete(locals.uid, sectionId));
};
