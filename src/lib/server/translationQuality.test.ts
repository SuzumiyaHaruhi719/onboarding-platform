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

	it('accepts a faithful chapter that rewords a minority of numbers', () => {
		// Real-world failure: the model keeps the facts but reformats some
		// (1,000→1000, 2.0 million→2 million). That must NOT trigger fallback.
		const source =
			'Founded in 2008, GLP manages 1,000 parks over 2.0 million sqm, with 300 clients, 45 cities, 12 funds, and 99% occupancy.';
		const blocks: BlockInput[] = [
			{
				type: 'paragraph',
				text: 'Founded in 2008, GLP manages 1000 logistics parks spanning roughly 2 million square meters, serving 300 clients across 45 cities through 12 funds at 99% occupancy.'
			}
		];
		expect(validateTranslationQuality(source, blocks)).toEqual([]);
	});

	it('rejects a gutted summary that drops most facts', () => {
		const source =
			'Founded in 2008, GLP manages 1,000 parks over 2.0 million sqm, with 300 clients, 45 cities, 12 funds, and 99% occupancy.';
		const blocks: BlockInput[] = [
			{ type: 'paragraph', text: 'GLP is a logistics company with many facilities worldwide.' }
		];
		const issues = validateTranslationQuality(source, blocks);
		expect(issues.some((i) => i.startsWith('low fact coverage'))).toBe(true);
	});
});
