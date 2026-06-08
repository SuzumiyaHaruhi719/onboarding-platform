import { getContext, setContext } from 'svelte';
import type { TranslateFn, Lang } from './index';

export interface I18n {
	t: TranslateFn;
	lang: Lang;
}

const I18N_KEY = Symbol('i18n');

/**
 * Store a *getter* (not a snapshot) so child components re-render reactively when
 * the language changes. The provider passes `() => ($derived i18n value)`.
 */
export function setI18n(get: () => I18n): void {
	setContext(I18N_KEY, get);
}

export function useI18n(): () => I18n {
	return getContext<() => I18n>(I18N_KEY);
}
