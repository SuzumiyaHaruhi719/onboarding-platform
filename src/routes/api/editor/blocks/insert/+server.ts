import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditor } from '$lib/server/guard';
import { insertBlocksAt } from '$lib/server/editor';
import { insertBlocksSchema } from '$lib/server/schemas';

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const parsed = insertBlocksSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });
	const { sectionId, blocks, position } = parsed.data;
	const count = insertBlocksAt(sectionId, blocks, position);
	return json({ ok: true, count });
};
