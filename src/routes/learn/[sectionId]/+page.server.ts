import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSectionView } from '$lib/db/queries';
import { isUnlocked, startSection } from '$lib/server/progress';
import { getEditorQuizzes } from '$lib/server/editor';

export const load: PageServerLoad = ({ params, locals }) => {
	const id = params.sectionId;

	const section = getSectionView(id);
	if (!section) error(404, '章节不存在 / Section not found');

	// Editors view and inline-edit any section, with no anti-skip gating.
	if (locals.role === 'editor') {
		return { section, editorQuizzes: getEditorQuizzes(id) };
	}

	// Learners: server-authoritative gate — locked sections never reach the client.
	if (!isUnlocked(locals.uid, id)) error(403, '本节尚未解锁 / Section locked');
	startSection(locals.uid, id);
	return { section, editorQuizzes: null };
};
