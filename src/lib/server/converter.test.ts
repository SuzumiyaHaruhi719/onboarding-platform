import { describe, expect, it } from 'vitest';
import { blocksToMarkdown, cleanExtractedSource, mdToBlocks, textToBlocks } from './converter';

describe('document conversion cleanup', () => {
	it('removes extractor metadata and front matter before parsing', () => {
		const source = `--- title: "Docs" created: 2026-06-08T01:18:00.000Z modified: 2026-06-08T01:18:00.000Z
Language: "zh" IsLinearized: false ---
---

## GLP VALUES

Have   the   passion   to   be   the   best`;

		const cleaned = cleanExtractedSource(source);

		expect(cleaned).not.toContain('created:');
		expect(cleaned).not.toContain('IsLinearized');
		expect(mdToBlocks(source)).toEqual([
			{ type: 'heading', level: 3, text: 'GLP VALUES' },
			{ type: 'paragraph', text: 'Have the passion to be the best' }
		]);
	});

	it('repairs hard-wrapped PDF text into readable paragraphs', () => {
		const blocks = textToBlocks(`Keep a positive attitude; be resilient in the
face of adversity

Avoid bureaucracy; move fast to achieve our
goals.`);

		expect(blocks).toEqual([
			{ type: 'paragraph', text: 'Keep a positive attitude; be resilient in the face of adversity' },
			{ type: 'paragraph', text: 'Avoid bureaucracy; move fast to achieve our goals.' }
		]);
	});

	it('removes spaces inserted between CJK characters', () => {
		expect(blocksToMarkdown(textToBlocks('拥 有 激 情，追 求 卓 越'))).toBe('拥有激情，追求卓越');
	});
});
