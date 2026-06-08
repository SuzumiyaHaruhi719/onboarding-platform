import { error } from '@sveltejs/kit';

/** Throw 403 unless the current session is an editor. */
export function requireEditor(locals: App.Locals): void {
	if (locals.role !== 'editor') error(403, '需要编辑者权限 / Editor access required');
}
