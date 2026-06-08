import { marked } from 'marked';

marked.use({ gfm: true, breaks: false });

/** Strip the dangerous bits. Content is authored by trusted editors and produced
 *  by TipTap (clean Markdown), so a focused denylist is sufficient here. */
function sanitize(html: string): string {
	return html
		.replace(/<\/(?:script|style|iframe|object|embed|link|meta)>/gi, '')
		.replace(/<(?:script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, '')
		.replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
		.replace(/\son\w+\s*=\s*'[^']*'/gi, '')
		.replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
		.replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
		.replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");
}

/** Render Markdown → sanitized HTML (isomorphic: works in SSR and the browser). */
export function renderMarkdown(md: string): string {
	if (!md) return '';
	const html = marked.parse(md, { async: false }) as string;
	return sanitize(html);
}
