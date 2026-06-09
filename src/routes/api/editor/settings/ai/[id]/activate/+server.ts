import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditor } from '$lib/server/guard';
import { activateProfile } from '$lib/server/ai-settings';

/** Make this profile the sole active one. */
export const POST: RequestHandler = ({ params, locals }) => {
	requireEditor(locals);
	return activateProfile(params.id!)
		? json({ ok: true })
		: json({ ok: false, error: '档案不存在', errorEn: 'Profile not found' }, { status: 404 });
};
