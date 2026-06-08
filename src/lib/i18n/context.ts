import { getContext, setContext } from 'svelte';
import type { TranslateFn } from './index';

const T_KEY = Symbol('i18n-translate');

export function setTranslate(t: TranslateFn): void {
	setContext(T_KEY, t);
}

export function getTranslate(): TranslateFn {
	return getContext<TranslateFn>(T_KEY);
}
