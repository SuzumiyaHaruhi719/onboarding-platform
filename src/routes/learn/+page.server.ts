import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { orderedSectionIds } from '$lib/db/queries';
import { progressMap } from '$lib/server/progress';

export const load: PageServerLoad = ({ locals, url }) => {
	const ids = orderedSectionIds();
	if (ids.length === 0) return { empty: true };

	const pm = progressMap(locals.uid);
	const target = ids.find((id) => pm[id] !== 'completed') ?? ids[ids.length - 1]!;
	const learnerPreview = locals.role === 'editor' && url.searchParams.get('view') === 'learner';
	redirect(307, `/learn/${target}${learnerPreview ? '?view=learner' : ''}`);
};
