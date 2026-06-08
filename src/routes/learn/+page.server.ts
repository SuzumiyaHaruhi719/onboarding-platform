import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { orderedSectionIds } from '$lib/db/queries';
import { progressMap } from '$lib/server/progress';

export const load: PageServerLoad = ({ locals }) => {
	const ids = orderedSectionIds();
	if (ids.length === 0) return { empty: true };

	const pm = progressMap(locals.uid);
	const target = ids.find((id) => pm[id] !== 'completed') ?? ids[ids.length - 1]!;
	redirect(307, `/learn/${target}`);
};
