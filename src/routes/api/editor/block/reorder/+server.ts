import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditor } from '$lib/server/guard';
import { reorderBlocks } from '$lib/server/editor';
import { reorderSchema } from '$lib/server/schemas';

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });
	reorderBlocks(parsed.data.orderedIds);
	return json({ ok: true });
};
