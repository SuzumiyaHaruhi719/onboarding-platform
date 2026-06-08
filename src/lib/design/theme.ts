export type Theme = 'light' | 'dark';

const KEY = 'theme';

export function getTheme(): Theme {
	if (typeof localStorage === 'undefined') return 'light';
	return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
	document.documentElement.dataset.theme = theme;
	localStorage.setItem(KEY, theme);
}

export function toggleTheme(): Theme {
	const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
	applyTheme(next);
	return next;
}
