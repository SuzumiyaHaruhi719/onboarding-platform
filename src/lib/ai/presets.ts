// OpenAI-compatible provider presets. The AI agent talks to any /chat/completions
// endpoint with Bearer auth, so "support all providers" is just baseUrl + key + model.
// Shared by client (settings form) and server (validation, lazy env seed).

export type ProviderId =
	| 'openai'
	| 'dashscope'
	| 'deepseek'
	| 'moonshot'
	| 'openrouter'
	| 'groq'
	| 'ollama'
	| 'custom';

export interface ProviderPreset {
	id: ProviderId;
	/** Human label shown in the picker. */
	label: string;
	/** OpenAI-compatible root (…/v1). Empty for `custom`. */
	baseUrl: string;
	/** Sensible default model for this provider. Empty for `custom`. */
	defaultModel: string;
	/** True when the endpoint typically needs no API key (local runtimes). */
	keyless: boolean;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
	{
		id: 'openai',
		label: 'OpenAI',
		baseUrl: 'https://api.openai.com/v1',
		defaultModel: 'gpt-4o-mini',
		keyless: false
	},
	{
		id: 'dashscope',
		label: 'DashScope · 通义千问',
		baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
		defaultModel: 'qwen-plus',
		keyless: false
	},
	{
		id: 'deepseek',
		label: 'DeepSeek',
		baseUrl: 'https://api.deepseek.com/v1',
		defaultModel: 'deepseek-chat',
		keyless: false
	},
	{
		id: 'moonshot',
		label: 'Moonshot · Kimi',
		baseUrl: 'https://api.moonshot.cn/v1',
		defaultModel: 'moonshot-v1-8k',
		keyless: false
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		baseUrl: 'https://openrouter.ai/api/v1',
		defaultModel: 'openai/gpt-4o-mini',
		keyless: false
	},
	{
		id: 'groq',
		label: 'Groq',
		baseUrl: 'https://api.groq.com/openai/v1',
		defaultModel: 'llama-3.3-70b-versatile',
		keyless: false
	},
	{
		id: 'ollama',
		label: 'Ollama · 本地',
		baseUrl: 'http://localhost:11434/v1',
		defaultModel: 'llama3.1',
		keyless: true
	},
	{
		id: 'custom',
		label: 'Custom · 自定义',
		baseUrl: '',
		defaultModel: '',
		keyless: false
	}
] as const;

const PRESET_BY_ID = new Map<ProviderId, ProviderPreset>(PROVIDER_PRESETS.map((p) => [p.id, p]));

export function isProviderId(value: string): value is ProviderId {
	return PRESET_BY_ID.has(value as ProviderId);
}

/** Look up a preset; unknown ids fall back to `custom`. */
export function getPreset(id: string): ProviderPreset {
	return PRESET_BY_ID.get(id as ProviderId) ?? PRESET_BY_ID.get('custom')!;
}
