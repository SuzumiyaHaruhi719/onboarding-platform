import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditor } from '$lib/server/guard';
import { aiProfileInputSchema } from '$lib/server/schemas';
import { updateProfile, deleteProfile } from '$lib/server/ai-settings';

const notFound = () =>
	json({ ok: false, error: '档案不存在', errorEn: 'Profile not found' }, { status: 404 });

/** Update a profile. A blank/omitted apiKey keeps the stored key. */
export const PUT: RequestHandler = async ({ request, params, locals }) => {
	requireEditor(locals);
	const body = await request.json().catch(() => null);
	const parsed = aiProfileInputSchema.safeParse(body);
	if (!parsed.success) {
		return json({ ok: false, error: '参数无效', errorEn: 'Invalid input' }, { status: 400 });
	}
	return updateProfile(params.id!, parsed.data) ? json({ ok: true }) : notFound();
};

export const DELETE: RequestHandler = ({ params, locals }) => {
	requireEditor(locals);
	return deleteProfile(params.id!) ? json({ ok: true }) : notFound();
};
