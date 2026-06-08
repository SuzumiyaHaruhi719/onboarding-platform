import type { PageServerLoad } from './$types';
import { listAllModules } from '$lib/server/editor';

export const load: PageServerLoad = () => ({ modules: listAllModules() });
