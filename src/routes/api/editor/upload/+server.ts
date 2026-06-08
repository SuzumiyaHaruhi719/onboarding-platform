import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditor } from '$lib/server/guard';
import { saveVideo, MAX_VIDEO_BYTES } from '$lib/server/media';

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File)) return json({ ok: false, error: 'no file' }, { status: 400 });
	if (file.size > MAX_VIDEO_BYTES) return json({ ok: false, error: 'too large' }, { status: 413 });
	try {
		const filename = await saveVideo(file);
		return json({ ok: true, url: `/media/${filename}` });
	} catch {
		return json({ ok: false, error: 'unsupported type' }, { status: 400 });
	}
};
