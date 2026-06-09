import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditor } from '$lib/server/guard';
import { aiProfileInputSchema } from '$lib/server/schemas';
import { createProfile } from '$lib/server/ai-settings';

/** Create a new AI provider profile. Reads are served by the page loader. */
export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const body = await request.json().catch(() => null);
	const parsed = aiProfileInputSchema.safeParse(body);
	if (!parsed.success) {
		return json({ ok: false, error: '参数无效', errorEn: 'Invalid input' }, { status: 400 });
	}
	const id = createProfile(parsed.data);
	return json({ ok: true, id });
};
