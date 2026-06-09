// Pure AI-config logic — no DB, no env imports — so it is trivially unit-testable.
// The DB/env wiring lives in ai-settings.ts and calls into these helpers.

import { getPreset } from '$lib/ai/presets';

/** Defaults mirror the original agent.ts env fallbacks (DashScope / qwen). */
export const DEFAULT_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const DEFAULT_MODEL = 'qwen3.7-plus';
export const DEFAULT_TIMEOUT_MS = 60_000;

/** Fully-resolved config the AI agent runs with. `apiKey` may be empty (keyless endpoints). */
export interface AiConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	timeoutMs: number;
}

/** A stored profile reduced to the fields config resolution cares about. */
export interface ProfileConfig {
	baseUrl: string;
	model: string;
	apiKey: string;
	timeoutMs: number;
}

/** Values read from `.env` (all optional). */
export interface EnvConfig {
	apiKey?: string;
	baseUrl?: string;
	model?: string;
	timeoutMs?: number;
}

export interface KeyMask {
	keySet: boolean;
	keyHint: string;
}

/** Join an OpenAI-compatible base URL with the chat endpoint, tolerating a trailing slash. */
export function chatCompletionsUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, '') + '/chat/completions';
}

/** Reduce a secret to a safe display form: whether it's set + its last 4 chars. */
export function maskKey(key: string): KeyMask {
	if (!key) return { keySet: false, keyHint: '' };
	return { keySet: true, keyHint: key.slice(-4) };
}

/** The baseUrl + default model a provider preset prefills in the form. */
export function applyPreset(providerId: string): { baseUrl: string; model: string } {
	const preset = getPreset(providerId);
	return { baseUrl: preset.baseUrl, model: preset.defaultModel };
}

/** A profile is usable only when it has both an endpoint and a model. */
function isUsableProfile(p: ProfileConfig | null): p is ProfileConfig {
	return !!p && !!p.baseUrl && !!p.model;
}

/**
 * Resolve the effective config from (active profile, env), in that priority:
 *   1. a usable active profile,
 *   2. else env if it carries a key (baseUrl/model/timeout default-filled),
 *   3. else null → caller falls back to local parsing.
 */
export function pickConfig(profile: ProfileConfig | null, env: EnvConfig | null): AiConfig | null {
	if (isUsableProfile(profile)) {
		return {
			baseUrl: profile.baseUrl,
			apiKey: profile.apiKey ?? '',
			model: profile.model,
			timeoutMs: profile.timeoutMs > 0 ? profile.timeoutMs : DEFAULT_TIMEOUT_MS
		};
	}
	if (env?.apiKey) {
		return {
			baseUrl: env.baseUrl || DEFAULT_BASE,
			apiKey: env.apiKey,
			model: env.model || DEFAULT_MODEL,
			timeoutMs: env.timeoutMs && env.timeoutMs > 0 ? env.timeoutMs : DEFAULT_TIMEOUT_MS
		};
	}
	return null;
}
