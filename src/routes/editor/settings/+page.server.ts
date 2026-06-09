import type { PageServerLoad } from './$types';
import { requireEditor } from '$lib/server/guard';
import { listProfiles, getActiveProfileId } from '$lib/server/ai-settings';

export const load: PageServerLoad = ({ locals }) => {
	requireEditor(locals);
	return {
		profiles: listProfiles(), // key-masked; never carries the raw secret
		activeId: getActiveProfileId()
	};
};
