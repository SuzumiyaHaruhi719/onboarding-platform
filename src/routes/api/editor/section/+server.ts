import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { requireEditor } from '$lib/server/guard';
import { createSection, updateSection, deleteSection } from '$lib/server/editor';
import { createSectionSchema, updateSectionSchema } from '$lib/server/schemas';

const id = z.string().min(1).max(100);

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const parsed = createSectionSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });
	return json({ ok: true, id: createSection(parsed.data.moduleId, parsed.data.title) });
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const body = await request.json().catch(() => null);
	const idParsed = z.object({ id }).safeParse(body);
	const patchParsed = updateSectionSchema.safeParse(body);
	if (!idParsed.success || !patchParsed.success) return json({ ok: false }, { status: 400 });
	updateSection(idParsed.data.id, patchParsed.data);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const parsed = z.object({ id }).safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });
	deleteSection(parsed.data.id);
	return json({ ok: true });
};
