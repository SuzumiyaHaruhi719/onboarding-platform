import type { BlockInput } from '$lib/content/types';

const METADATA_RE = /\b(title|created|modified|islinearized|producer|creator)\b\s*[:=]/i;

function blockText(block: BlockInput): string {
	switch (block.type) {
		case 'heading':
		case 'paragraph':
		case 'quote':
			return block.text;
		case 'list':
			return block.items.join(' ');
		case 'callout':
			return `${block.title} ${block.body}`;
		case 'richtext':
			return block.markdown;
		default:
			return '';
	}
}

function visibleLength(text: string): number {
	return text.replace(/\s+/g, '').length;
}

function requiredFacts(source: string): string[] {
	const facts = new Set<string>();
	for (const match of source.matchAll(/\b\d+(?:[.,:]\d+)*(?:%|ms|s|min|h|天|小时|分钟|秒|次|年|月|日)?\b/g)) {
		facts.add(match[0]);
	}
	for (const match of source.matchAll(/\b[A-Z][A-Z0-9&-]{1,}\b/g)) {
		const value = match[0];
		if (value.length <= 6 || /[\d&-]/.test(value)) facts.add(value);
	}
	for (const match of source.matchAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g)) {
		facts.add(match[0]);
	}
	for (const match of source.matchAll(/https?:\/\/[^\s)]+/g)) {
		facts.add(match[0]);
	}
	return [...facts].filter((fact) => fact.length <= 80).slice(0, 40);
}

export function validateTranslationQuality(source: string, blocks: BlockInput[]): string[] {
	const issues: string[] = [];
	const output = blocks.map(blockText).join('\n\n');
	const contentBlocks = blocks.filter((block) => block.type !== 'heading');

	if (blocks.length === 0) issues.push('no blocks returned');
	if (contentBlocks.length === 0) issues.push('no readable body content returned');
	if (METADATA_RE.test(output)) issues.push('extractor metadata leaked into output');

	const paragraphs = blocks.filter((block): block is Extract<BlockInput, { type: 'paragraph' }> => block.type === 'paragraph');
	if (paragraphs.length >= 3) {
		const shortCount = paragraphs.filter((block) => visibleLength(block.text) < 18).length;
		if (shortCount / paragraphs.length > 0.5) issues.push('too many tiny fragmented paragraphs');
	}

	// Fact preservation. A faithful chapter keeps the source's key numbers/acronyms,
	// but the model legitimately rewords some (1,000→1000, 2.0万→2万, rounding). So:
	//  - small docs (<6 facts): each one matters → require all (catches gutting).
	//  - larger docs: tolerate a minority missing; only flag WHOLESALE loss, which
	//    signals the model summarized away real content rather than translated it.
	const facts = requiredFacts(source);
	const missing = facts.filter((fact) => !hasFact(output, fact));
	if (facts.length < 6) {
		for (const fact of missing) issues.push(`required fact missing: ${fact}`);
	} else if (missing.length / facts.length > 0.45) {
		const kept = facts.length - missing.length;
		issues.push(
			`low fact coverage: kept ${kept}/${facts.length} (missing e.g. ${missing.slice(0, 5).join(', ')})`
		);
	}

	return issues;
}

/** Normalize a number-ish string for tolerant comparison: drop thousands commas
 *  and spaces so "1,000" / "1 000" / "1000" all match. */
function normNum(s: string): string {
	return s.replace(/[,\s]/g, '');
}

function hasFact(output: string, fact: string): boolean {
	if (output.includes(fact)) return true;
	// Numeric facts: tolerate thousands-separator / spacing differences.
	if (/^\d[\d.,:\s]*$/.test(fact)) {
		if (normNum(output).includes(normNum(fact))) return true;
	}
	const time = /^(\d+)(h|小时)$/i.exec(fact);
	if (time) {
		const amount = time[1];
		return new RegExp(`\\b${amount}\\s*(h|hour|hours|小时)\\b`, 'i').test(output);
	}
	return false;
}
