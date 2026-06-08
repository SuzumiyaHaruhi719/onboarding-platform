import type { BlockInput } from '$lib/content/types';

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

/**
 * Deterministic local fallback when the AI agent is unavailable. Parses a
 * useful subset of Markdown (headings, lists, quotes, paragraphs) into blocks.
 */
export function mdToBlocks(md: string): BlockInput[] {
	const lines = md.replace(/\r\n/g, '\n').split('\n');
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
	return text
		.replace(/\r\n/g, '\n')
		.split(/\n{2,}/)
		.map((s) => normalizeText(s.replace(/\n/g, ' ')))
		.filter(Boolean)
		.map((t) => ({ type: 'paragraph', text: t.slice(0, 8000) }) as BlockInput);
}
