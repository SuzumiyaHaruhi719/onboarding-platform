// DB + env wiring for AI provider profiles. Pure config logic lives in ai-config.ts.
import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/db';
import {
	maskKey,
	pickConfig,
	chatCompletionsUrl,
	type AiConfig,
	type EnvConfig,
	type ProfileConfig
} from './ai-config';

type ProfileRow = typeof schema.aiProfiles.$inferSelect;

/** Client-safe view of a profile — never carries the raw key. */
export interface AiProfileView {
	id: string;
	name: string;
	provider: string;
	baseUrl: string;
	model: string;
	timeoutMs: number;
	active: boolean;
	keySet: boolean;
	keyHint: string;
}

/** Form payload. On update, an empty/omitted apiKey means "keep the stored key". */
export interface AiProfileInput {
	name: string;
	provider: string;
	baseUrl: string;
	model: string;
	apiKey?: string;
	timeoutMs?: number;
}

export interface TestResult {
	ok: boolean;
	latencyMs?: number;
	error?: string;
}

const DEFAULT_TIMEOUT_MS = 60_000;
/** Cap test requests so a misconfigured endpoint can't hang the settings UI. */
const TEST_TIMEOUT_CAP_MS = 20_000;

function numeric(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Read AI settings from .env (the first-run seed / fallback source). */
function readEnv(): EnvConfig {
	return {
		apiKey: env.DASHSCOPE_API_KEY || undefined,
		baseUrl: env.DASHSCOPE_BASE_URL || undefined,
		model: env.QWEN_MODEL || undefined,
		timeoutMs: env.DASHSCOPE_TIMEOUT_MS ? numeric(env.DASHSCOPE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS) : undefined
	};
}

function toView(row: ProfileRow): AiProfileView {
	const mask = maskKey(row.apiKey);
	return {
		id: row.id,
		name: row.name,
		provider: row.provider,
		baseUrl: row.baseUrl,
		model: row.model,
		timeoutMs: row.timeoutMs,
		active: row.active === 1,
		keySet: mask.keySet,
		keyHint: mask.keyHint
	};
}

function rowToProfileConfig(row: ProfileRow): ProfileConfig {
	return { baseUrl: row.baseUrl, model: row.model, apiKey: row.apiKey, timeoutMs: row.timeoutMs };
}

function allRows(): ProfileRow[] {
	return db.select().from(schema.aiProfiles).orderBy(schema.aiProfiles.createdAt).all();
}

function getRow(id: string): ProfileRow | null {
	return db.select().from(schema.aiProfiles).where(eq(schema.aiProfiles.id, id)).get() ?? null;
}

function getActiveRow(): ProfileRow | null {
	return db.select().from(schema.aiProfiles).where(eq(schema.aiProfiles.active, 1)).get() ?? null;
}

/**
 * One-time lazy migration: if there are no profiles yet but .env carries a key,
 * create an active profile from it so existing .env setups appear in the panel.
 */
function seedFromEnvIfEmpty(): void {
	if (allRows().length > 0) return;
	const e = readEnv();
	if (!e.apiKey) return;
	const baseUrl = e.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
	const provider = baseUrl.includes('dashscope') ? 'dashscope' : 'custom';
	db.insert(schema.aiProfiles)
		.values({
			id: randomUUID(),
			name: '默认配置 (来自 .env)',
			provider,
			baseUrl,
			model: e.model || 'qwen3.7-plus',
			apiKey: e.apiKey,
			timeoutMs: e.timeoutMs && e.timeoutMs > 0 ? e.timeoutMs : DEFAULT_TIMEOUT_MS,
			active: 1,
			createdAt: Date.now()
		})
		.run();
}

/** List profiles (key-masked) for the settings UI; seeds from .env on first call. */
export function listProfiles(): AiProfileView[] {
	seedFromEnvIfEmpty();
	return allRows().map(toView);
}

export function getActiveProfileId(): string | null {
	return getActiveRow()?.id ?? null;
}

/** Create a profile. The very first profile is auto-activated so AI works immediately. */
export function createProfile(input: AiProfileInput): string {
	const id = randomUUID();
	const isFirst = allRows().length === 0;
	db.insert(schema.aiProfiles)
		.values({
			id,
			name: input.name,
			provider: input.provider,
			baseUrl: input.baseUrl,
			model: input.model,
			apiKey: input.apiKey ?? '',
			timeoutMs: input.timeoutMs && input.timeoutMs > 0 ? input.timeoutMs : DEFAULT_TIMEOUT_MS,
			active: isFirst ? 1 : 0,
			createdAt: Date.now()
		})
		.run();
	return id;
}

/** Update a profile. A blank/omitted apiKey keeps the stored key unchanged. */
export function updateProfile(id: string, input: AiProfileInput): boolean {
	const row = getRow(id);
	if (!row) return false;
	db.update(schema.aiProfiles)
		.set({
			name: input.name,
			provider: input.provider,
			baseUrl: input.baseUrl,
			model: input.model,
			apiKey: input.apiKey ? input.apiKey : row.apiKey,
			timeoutMs: input.timeoutMs && input.timeoutMs > 0 ? input.timeoutMs : row.timeoutMs
		})
		.where(eq(schema.aiProfiles.id, id))
		.run();
	return true;
}

export function deleteProfile(id: string): boolean {
	const row = getRow(id);
	if (!row) return false;
	db.delete(schema.aiProfiles).where(eq(schema.aiProfiles.id, id)).run();
	return true;
}

/** Make `id` the sole active profile (single-active invariant, in one transaction). */
export function activateProfile(id: string): boolean {
	if (!getRow(id)) return false;
	db.transaction((tx) => {
		tx.update(schema.aiProfiles).set({ active: 0 }).run();
		tx.update(schema.aiProfiles).set({ active: 1 }).where(eq(schema.aiProfiles.id, id)).run();
	});
	return true;
}

/** The effective config the agent runs with: active profile → env → null. */
export function resolveActiveAiConfig(): AiConfig | null {
	const active = getActiveRow();
	return pickConfig(active ? rowToProfileConfig(active) : null, readEnv());
}

export function hasActiveAiConfig(): boolean {
	return resolveActiveAiConfig() !== null;
}

/**
 * Build the config to test from a form payload. When the key field is blank and an
 * existing profile id is supplied, reuse that profile's stored key (so "test before
 * save" works without re-typing the secret).
 */
export function resolveConfigForTest(
	input: Pick<AiProfileInput, 'baseUrl' | 'model' | 'apiKey' | 'timeoutMs'>,
	existingId?: string
): AiConfig {
	let apiKey = input.apiKey ?? '';
	if (!apiKey && existingId) apiKey = getRow(existingId)?.apiKey ?? '';
	return {
		baseUrl: input.baseUrl,
		apiKey,
		model: input.model,
		timeoutMs: input.timeoutMs && input.timeoutMs > 0 ? input.timeoutMs : DEFAULT_TIMEOUT_MS
	};
}

/** Probe an endpoint with a minimal (max_tokens:1) request. Never throws; returns a result. */
export async function testConnection(config: AiConfig): Promise<TestResult> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, TEST_TIMEOUT_CAP_MS));
	const started = Date.now();
	try {
		const headers: Record<string, string> = { 'content-type': 'application/json' };
		if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
		const res = await fetch(chatCompletionsUrl(config.baseUrl), {
			method: 'POST',
			headers,
			signal: controller.signal,
			body: JSON.stringify({
				model: config.model,
				messages: [{ role: 'user', content: 'ping' }],
				max_tokens: 1,
				temperature: 0
			})
		});
		if (!res.ok) {
			const body = await res.text().catch(() => '');
			return { ok: false, error: `HTTP ${res.status}${body ? ': ' + body.slice(0, 200) : ''}` };
		}
		return { ok: true, latencyMs: Date.now() - started };
	} catch (e) {
		if (e instanceof Error && e.name === 'AbortError') return { ok: false, error: '请求超时 / timeout' };
		return { ok: false, error: e instanceof Error ? e.message : 'unknown error' };
	} finally {
		clearTimeout(timeout);
	}
}
