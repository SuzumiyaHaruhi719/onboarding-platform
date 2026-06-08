import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSectionView } from '$lib/db/queries';
import { isUnlocked, startSection } from '$lib/server/progress';

export const load: PageServerLoad = ({ params, locals }) => {
	const id = params.sectionId;

	const section = getSectionView(id);
	if (!section) error(404, '章节不存在 / Section not found');

	// Server-authoritative gate: locked sections never hand their content to the client.
	if (!isUnlocked(locals.uid, id)) error(403, '本节尚未解锁 / Section locked');

	startSection(locals.uid, id);
	return { section };
};
