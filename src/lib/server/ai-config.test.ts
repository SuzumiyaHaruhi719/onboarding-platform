import { describe, it, expect } from 'vitest';
import {
	maskKey,
	applyPreset,
	pickConfig,
	chatCompletionsUrl,
	DEFAULT_BASE,
	DEFAULT_MODEL,
	DEFAULT_TIMEOUT_MS
} from './ai-config';

describe('chatCompletionsUrl', () => {
	it('appends the chat path', () => {
		expect(chatCompletionsUrl('https://x/v1')).toBe('https://x/v1/chat/completions');
	});
	it('tolerates a trailing slash', () => {
		expect(chatCompletionsUrl('https://x/v1/')).toBe('https://x/v1/chat/completions');
	});
});

describe('maskKey', () => {
	it('reports unset for an empty key', () => {
		expect(maskKey('')).toEqual({ keySet: false, keyHint: '' });
	});

	it('exposes only the last 4 characters', () => {
		expect(maskKey('sk-1234567890')).toEqual({ keySet: true, keyHint: '7890' });
	});

	it('returns the whole key as hint when shorter than 4 chars', () => {
		expect(maskKey('abc')).toEqual({ keySet: true, keyHint: 'abc' });
	});
});

describe('applyPreset', () => {
	it('fills baseUrl and model from a known provider', () => {
		expect(applyPreset('deepseek')).toEqual({
			baseUrl: 'https://api.deepseek.com/v1',
			model: 'deepseek-chat'
		});
	});

	it('returns empty fields for custom', () => {
		expect(applyPreset('custom')).toEqual({ baseUrl: '', model: '' });
	});

	it('falls back to custom for an unknown id', () => {
		expect(applyPreset('nope')).toEqual({ baseUrl: '', model: '' });
	});
});

describe('pickConfig precedence', () => {
	it('uses a usable active profile first (key passed through verbatim)', () => {
		const profile = { baseUrl: 'https://x/v1', model: 'm', apiKey: 'sk-aaa', timeoutMs: 5000 };
		expect(pickConfig(profile, { apiKey: 'env-key' })).toEqual({
			baseUrl: 'https://x/v1',
			apiKey: 'sk-aaa',
			model: 'm',
			timeoutMs: 5000
		});
	});

	it('allows a keyless profile (empty apiKey) — e.g. local Ollama', () => {
		const profile = { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', apiKey: '', timeoutMs: 60000 };
		expect(pickConfig(profile, null)?.apiKey).toBe('');
	});

	it('falls back to env when the profile is missing a model', () => {
		const profile = { baseUrl: 'https://x/v1', model: '', apiKey: 'sk-aaa', timeoutMs: 5000 };
		expect(pickConfig(profile, { apiKey: 'env-key' })).toEqual({
			baseUrl: DEFAULT_BASE,
			apiKey: 'env-key',
			model: DEFAULT_MODEL,
			timeoutMs: DEFAULT_TIMEOUT_MS
		});
	});

	it('honors explicit env baseUrl/model/timeout over defaults', () => {
		expect(pickConfig(null, { apiKey: 'k', baseUrl: 'https://e/v1', model: 'em', timeoutMs: 1234 })).toEqual({
			baseUrl: 'https://e/v1',
			apiKey: 'k',
			model: 'em',
			timeoutMs: 1234
		});
	});

	it('returns null when env has no key and no usable profile', () => {
		expect(pickConfig(null, { baseUrl: 'https://e/v1' })).toBeNull();
		expect(pickConfig(null, null)).toBeNull();
	});
});
