import type { LayoutServerLoad } from './$types';
import { listModulesWithSections } from '$lib/db/queries';
import { progressMap } from '$lib/server/progress';

export const load: LayoutServerLoad = ({ locals }) => ({
	modules: listModulesWithSections(),
	progress: progressMap(locals.uid)
});
