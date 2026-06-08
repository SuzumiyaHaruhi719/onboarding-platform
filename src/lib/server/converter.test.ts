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

	it('keeps obvious PDF/PPTX section titles as headings in fallback output', () => {
		expect(textToBlocks('GLP VALUES\n\n"赢"的文化 Winning\n\nHave the passion to be the best.')).toEqual([
			{ type: 'heading', level: 2, text: 'GLP VALUES' },
			{ type: 'heading', level: 2, text: '"赢"的文化 Winning' },
			{ type: 'paragraph', text: 'Have the passion to be the best.' }
		]);
	});

	it('recognizes PPTX markdown titles and removes slide note noise', () => {
		expect(mdToBlocks('Customer Data Discipline\n\nCore idea: protect data.\n\n> Note: 1')).toEqual([
			{ type: 'heading', level: 2, text: 'Customer Data Discipline' },
			{ type: 'paragraph', text: 'Core idea: protect data.' }
		]);
	});

	it('removes spaces inserted between CJK characters', () => {
		expect(blocksToMarkdown(textToBlocks('拥 有 激 情，追 求 卓 越'))).toBe('拥有激情，追求卓越');
	});
});
