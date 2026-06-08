import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { requireEditor } from '$lib/server/guard';
import { createModule, deleteModule } from '$lib/server/editor';
import { createModuleSchema } from '$lib/server/schemas';

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const parsed = createModuleSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });
	return json({ ok: true, id: createModule(parsed.data.title) });
};

const delSchema = z.object({ id: z.string().min(1).max(100) });

export const DELETE: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const parsed = delSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });
	deleteModule(parsed.data.id);
	return json({ ok: true });
};
