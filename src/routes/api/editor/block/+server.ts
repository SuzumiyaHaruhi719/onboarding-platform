import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { requireEditor } from '$lib/server/guard';
import { createBlock, updateBlock, deleteBlock } from '$lib/server/editor';
import { blockInputSchema } from '$lib/server/schemas';

const id = z.string().min(1).max(100);

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const parsed = z
		.object({ sectionId: id, block: blockInputSchema })
		.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });
	return json({ ok: true, id: createBlock(parsed.data.sectionId, parsed.data.block) });
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const parsed = z
		.object({ id, block: blockInputSchema })
		.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });
	updateBlock(parsed.data.id, parsed.data.block);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const parsed = z.object({ id }).safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });
	deleteBlock(parsed.data.id);
	return json({ ok: true });
};
