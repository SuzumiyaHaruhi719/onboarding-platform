import type { Handle } from '@sveltejs/kit';
import { ensureUid, getRole } from '$lib/server/session';
import { LANG_COOKIE, isLang } from '$lib/i18n';

export const handle: Handle = async ({ event, resolve }) => {
	const uid = ensureUid(event.cookies);
	event.locals.uid = uid;
	event.locals.role = getRole(uid);

	const langCookie = event.cookies.get(LANG_COOKIE);
	event.locals.lang = isLang(langCookie) ? langCookie : 'zh';

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.lang)
	});
};
