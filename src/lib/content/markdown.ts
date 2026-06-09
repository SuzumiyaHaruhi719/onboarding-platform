import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

marked.use({ gfm: true, breaks: false });

// Any link that opens a new tab must not leak the opener window.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
	if (node.tagName === 'A' && node.getAttribute('target')) {
		node.setAttribute('rel', 'noopener noreferrer');
	}
});

/** Tags a Markdown-authored block may legitimately produce. Everything else
 *  (script/style/iframe/object/svg/form/…) is stripped. */
const ALLOWED_TAGS = [
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'p', 'br', 'hr', 'blockquote', 'pre', 'code',
	'strong', 'em', 'b', 'i', 'del', 's', 'mark', 'sub', 'sup',
	'ul', 'ol', 'li',
	'a', 'img', 'video', 'source',
	'table', 'thead', 'tbody', 'tr', 'th', 'td',
	'span', 'div'
];

/** Only safe presentational/link attributes survive. DOMPurify's built-in
 *  default URI allowlist already rejects `javascript:`/`vbscript:` protocols. */
const ALLOWED_ATTR = [
	'href', 'title', 'alt', 'src', 'poster', 'controls', 'preload', 'type', 'align', 'colspan', 'rowspan', 'start', 'class', 'target', 'rel'
];

/**
 * Render Markdown → sanitized HTML (isomorphic: jsdom on the server, the real
 * DOM in the browser). DOMPurify is a real allowlist sanitizer — it neutralizes
 * raw-HTML injection that a regex denylist misses (e.g. `<a href=javascript:…>`,
 * unquoted handlers, mutation-XSS), which matters because block text can carry
 * AI-/file-derived content that is later interpreted as Markdown/HTML.
 */
export function renderMarkdown(md: string): string {
	if (!md) return '';
	const html = marked.parse(md, { async: false }) as string;
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS,
		ALLOWED_ATTR,
		FORBID_ATTR: ['style']
	});
}
