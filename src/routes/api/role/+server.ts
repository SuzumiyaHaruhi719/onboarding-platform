import { json, type RequestHandler } from '@sveltejs/kit';
import { setRole } from '$lib/server/session';
import { roleSchema } from '$lib/server/schemas';

export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = roleSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false }, { status: 400 });
	setRole(locals.uid, parsed.data.role);
	return json({ ok: true, role: parsed.data.role });
};
