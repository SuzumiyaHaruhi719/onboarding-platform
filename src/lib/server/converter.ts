import type { BlockInput } from '$lib/content/types';

const METADATA_LINE =
	/^(---\s*)?(title|author|creator|producer|created|modified|language|islinearized)\b[:=]?/i;

function isMetadataNoise(line: string): boolean {
	const compact = line.trim();
	if (!compact) return false;
	if (/^-{3,}$/.test(compact)) return true;
	if (/^---\s*(title|created|modified|language|islinearized)\b/i.test(compact)) return true;
	if (/^(language\s*:.*islinearized\s*:|islinearized\s*:)/i.test(compact)) return true;
	if (/^>?\s*note:\s*\d+\s*$/i.test(compact)) return true;
	return METADATA_LINE.test(compact);
}

function collapseBlankLines(text: string): string {
	return text
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** Strip extractor metadata and front matter before content is sent to AI or fallback parsing. */
export function cleanExtractedSource(source: string): string {
	let text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	text = text.replace(/^\s*---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, '');
	const lines = text
		.split('\n')
		.map((line) => line.trimEnd())
		.filter((line) => !isMetadataNoise(line));
	return collapseBlankLines(lines.join('\n'));
}

/** Clean up messy extracted text: strip md anchors/emphasis, collapse spaces,
 *  and remove spurious spaces inserted between CJK characters (common in PDF/PPTX). */
function normalizeText(s: string): string {
	let out = s
		.replace(/\{#[^}]*\}/g, '') // markdown heading anchors {#id}
		.replace(/[*_`]+/g, '') // emphasis markers
		.replace(/[ \t]+/g, ' '); // collapse runs of spaces
	// Drop spaces between adjacent CJK characters / CJK punctuation ("关 心" -> "关心").
	out = out.replace(/([一-鿿　-〿＀-￯]) +(?=[一-鿿　-〿＀-￯])/g, '$1');
	return out.trim();
}

function looksLikeListItem(line: string): boolean {
	return /^([-*+]|\d+[.)])\s+/.test(line);
}

function shouldStartNewParagraph(previous: string, next: string): boolean {
	if (looksLikeListItem(next)) return true;
	if (!previous) return false;
	return /[。！？；.!?;]$/.test(previous);
}

function splitPlainParagraphs(text: string): string[] {
	const paragraphs: string[] = [];
	let current: string[] = [];
	const flush = (): void => {
		const value = normalizeText(current.join(' '));
		if (value) paragraphs.push(value);
		current = [];
	};

	for (const raw of cleanExtractedSource(text).split('\n')) {
		const line = raw.trim();
		if (!line) {
			flush();
			continue;
		}
		if (current.length && shouldStartNewParagraph(current.at(-1) ?? '', line)) flush();
		current.push(line);
	}
	flush();
	return paragraphs;
}

function isLikelyHeading(text: string): boolean {
	const compact = text.trim();
	if (compact.length < 3 || compact.length > 80) return false;
	if (/[。！？；.!?;]$/.test(compact)) return false;
	if (/^\d+[.)]\s+/.test(compact)) return false;
	if (/^[A-Z0-9][A-Z0-9&\-/ ]{2,}$/.test(compact)) return true;
	if (/\p{Script=Han}/u.test(compact)) return true;
	const words = compact.split(/\s+/);
	return words.length <= 5 && words.every((word) => /^[A-Z][A-Za-z0-9&:/-]*$/.test(word));
}

/**
 * Deterministic local fallback when the AI agent is unavailable. Parses a
 * useful subset of Markdown (headings, lists, quotes, paragraphs) into blocks.
 */
export function mdToBlocks(md: string): BlockInput[] {
	const lines = cleanExtractedSource(md).split('\n');
	const blocks: BlockInput[] = [];
	let para: string[] = [];
	let list: { ordered: boolean; items: string[] } | null = null;

	const flushPara = (): void => {
		const text = normalizeText(para.join(' '));
		if (text) blocks.push({ type: 'paragraph', text });
		para = [];
	};
	const flushList = (): void => {
		if (list && list.items.length) blocks.push({ type: 'list', ordered: list.ordered, items: list.items });
		list = null;
	};
	const flushAll = (): void => {
		flushPara();
		flushList();
	};

	for (const raw of lines) {
		const line = raw.trimEnd();
		if (!line.trim()) {
			flushAll();
			continue;
		}
		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			flushAll();
			const text = normalizeText(heading[2]!);
			if (text) blocks.push({ type: 'heading', level: heading[1]!.length <= 1 ? 2 : 3, text });
			continue;
		}
		if (para.length === 0 && isLikelyHeading(line.trim())) {
			flushList();
			const text = normalizeText(line);
			if (text) blocks.push({ type: 'heading', level: 2, text });
			continue;
		}
		const quote = /^>\s?(.*)$/.exec(line);
		if (quote) {
			flushPara();
			flushList();
			const text = normalizeText(quote[1]!);
			if (text) blocks.push({ type: 'quote', text });
			continue;
		}
		const ul = /^[-*+]\s+(.*)$/.exec(line);
		if (ul) {
			flushPara();
			if (!list || list.ordered) {
				flushList();
				list = { ordered: false, items: [] };
			}
			const item = normalizeText(ul[1]!);
			if (item) list.items.push(item);
			continue;
		}
		const ol = /^\d+[.)]\s+(.*)$/.exec(line);
		if (ol) {
			flushPara();
			if (!list || !list.ordered) {
				flushList();
				list = { ordered: true, items: [] };
			}
			const item = normalizeText(ol[1]!);
			if (item) list.items.push(item);
			continue;
		}
		flushList();
		para.push(line);
	}
	flushAll();
	return blocks;
}

/** Convert structured blocks into a single Markdown document (for the richtext block). */
export function blocksToMarkdown(blocks: BlockInput[]): string {
	const parts: string[] = [];
	for (const b of blocks) {
		switch (b.type) {
			case 'heading':
				parts.push((b.level === 2 ? '## ' : '### ') + b.text);
				break;
			case 'paragraph':
				parts.push(b.text);
				break;
			case 'list':
				parts.push(b.items.map((it, i) => (b.ordered ? `${i + 1}. ${it}` : `- ${it}`)).join('\n'));
				break;
			case 'quote':
				parts.push('> ' + b.text + (b.cite ? `\n>\n> — ${b.cite}` : ''));
				break;
			case 'callout':
				parts.push(`> **${b.title}**` + (b.body ? `\n>\n> ${b.body}` : ''));
				break;
			case 'richtext':
				parts.push(b.markdown);
				break;
			// image / video / quiz are not expressible in plain Markdown — skipped.
		}
	}
	return parts.filter((p) => p.trim()).join('\n\n');
}

/** Plain text → paragraph blocks split on blank lines. */
export function textToBlocks(text: string): BlockInput[] {
	const paragraphs = splitPlainParagraphs(text);
	return paragraphs.map((t) =>
		paragraphs.length > 1 && isLikelyHeading(t)
			? ({ type: 'heading', level: 2, text: t.slice(0, 300) } as BlockInput)
			: ({ type: 'paragraph', text: t.slice(0, 8000) } as BlockInput)
	);
}
