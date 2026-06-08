import { error, type RequestHandler } from '@sveltejs/kit';
import { readMedia } from '$lib/server/media';

export const GET: RequestHandler = async ({ params }) => {
	const media = await readMedia(params.file ?? '');
	if (!media) error(404, 'Not found');
	return new Response(new Uint8Array(media.data), {
		headers: {
			'content-type': media.type,
			'cache-control': 'public, max-age=3600',
			'content-length': String(media.data.length)
		}
	});
};
