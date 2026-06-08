import type { BlockInput } from '$lib/content/types';

/**
 * Deterministic local fallback when the AI agent is unavailable. Parses a
 * useful subset of Markdown (headings, lists, quotes, paragraphs) into blocks.
 */
export function mdToBlocks(md: string): BlockInput[] {
	const lines = md.replace(/\r\n/g, '\n').split('\n');
	const blocks: BlockInput[] = [];
	let para: string[] = [];
	let list: { ordered: boolean; items: string[] } | null = null;

	const stripInline = (s: string): string => s.replace(/[*_`]/g, '').trim();
	const flushPara = (): void => {
		const text = para.join(' ').trim();
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
			blocks.push({ type: 'heading', level: heading[1]!.length <= 1 ? 2 : 3, text: stripInline(heading[2]!) });
			continue;
		}
		const quote = /^>\s?(.*)$/.exec(line);
		if (quote) {
			flushPara();
			flushList();
			blocks.push({ type: 'quote', text: stripInline(quote[1]!) });
			continue;
		}
		const ul = /^[-*+]\s+(.*)$/.exec(line);
		if (ul) {
			flushPara();
			if (!list || list.ordered) {
				flushList();
				list = { ordered: false, items: [] };
			}
			list.items.push(stripInline(ul[1]!));
			continue;
		}
		const ol = /^\d+\.\s+(.*)$/.exec(line);
		if (ol) {
			flushPara();
			if (!list || !list.ordered) {
				flushList();
				list = { ordered: true, items: [] };
			}
			list.items.push(stripInline(ol[1]!));
			continue;
		}
		flushList();
		para.push(stripInline(line));
	}
	flushAll();
	return blocks;
}

/** Plain text → paragraph blocks split on blank lines. */
export function textToBlocks(text: string): BlockInput[] {
	return text
		.replace(/\r\n/g, '\n')
		.split(/\n{2,}/)
		.map((s) => s.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.map((t) => ({ type: 'paragraph', text: t.slice(0, 8000) }) as BlockInput);
}
