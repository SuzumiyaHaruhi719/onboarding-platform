import { dict, type DictKey, type Lang } from './dict';

export type { Lang, DictKey };
export { dict };

export const LANG_COOKIE = 'lang';

export function isLang(value: unknown): value is Lang {
	return value === 'zh' || value === 'en';
}

export type TranslateFn = (key: DictKey) => string;

/** Build a translator bound to a single language (SSR-safe, no shared module state). */
export function translator(lang: Lang): TranslateFn {
	return (key: DictKey): string => dict[key]?.[lang] ?? key;
}
