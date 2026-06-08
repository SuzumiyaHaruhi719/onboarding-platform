import { json, type RequestHandler } from '@sveltejs/kit';
import { applyHeartbeat, isUnlocked } from '$lib/server/progress';
import { heartbeatSchema } from '$lib/server/schemas';

export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = heartbeatSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });

	const { sectionId, scrolledToBottom, dwellMs, videoIntervals } = parsed.data;
	if (!isUnlocked(locals.uid, sectionId)) return json({ ok: false }, { status: 403 });

	applyHeartbeat(locals.uid, sectionId, { scrolledToBottom, dwellMs, videoIntervals });
	return json({ ok: true });
};
