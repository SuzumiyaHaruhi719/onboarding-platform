import { describe, expect, it } from 'vitest';
import { validateTranslationQuality } from './translationQuality';
import type { BlockInput } from '$lib/content/types';

describe('translation quality gate', () => {
	it('accepts readable structured output that preserves core facts', () => {
		const source = 'Security training must be completed by 2026-06-30. Contact HR-Ops for exceptions.';
		const blocks: BlockInput[] = [
			{ type: 'heading', level: 2, text: 'Security Training' },
			{
				type: 'paragraph',
				text: 'Security training must be completed by 2026-06-30. Contact HR-Ops for exceptions.'
			}
		];

		expect(validateTranslationQuality(source, blocks)).toEqual([]);
	});

	it('rejects leaked metadata and missing key facts', () => {
		const issues = validateTranslationQuality('Policy 42 applies to GLP teams.', [
			{ type: 'paragraph', text: 'title: Docs created: today. This policy applies to teams.' }
		]);

		expect(issues).toContain('extractor metadata leaked into output');
		expect(issues).toContain('required fact missing: 42');
		expect(issues).toContain('required fact missing: GLP');
	});
});
