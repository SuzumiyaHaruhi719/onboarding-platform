import { env } from '$env/dynamic/private';
import { blockInputSchema } from './schemas';
import type { BlockInput } from '$lib/content/types';

// $env/dynamic/private reads .env in dev (Vite does NOT populate process.env for
// server code) and the real process env in production — so the key loads either way.
const BASE = env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const MODEL = env.QWEN_MODEL || 'qwen3.7-plus';

/** The multimodal agent (qwen3.7-plus) is configured only when its key is set. */
export function hasAgentKey(): boolean {
	return !!env.DASHSCOPE_API_KEY;
}

const SYSTEM_PROMPT = `You are an onboarding content editor. Rewrite the raw source document into a polished, READABLE onboarding chapter — not a raw text dump. Reorganize, retitle, and rephrase for clarity and a welcoming onboarding tone, while staying faithful to the source's facts.

Return ONLY a JSON object: {"blocks": Block[]} where each Block is exactly one of:
{"type":"heading","level":2|3,"text":string}
{"type":"paragraph","text":string}
{"type":"list","ordered":boolean,"items":string[]}
{"type":"quote","text":string,"cite"?:string}
{"type":"callout","variant":"info"|"success"|"warning"|"error","title":string,"body":string}

Authoring guidelines:
- Open with a short intro paragraph that frames the chapter for a new hire.
- Group related content under clear, descriptive H2 sections (and H3 sub-sections where helpful); add headings even if the source lacks them.
- Write flowing, concise paragraphs in plain language — rephrase awkward or fragmented source text into smooth prose. Do NOT just paste extracted lines.
- Turn enumerations into lists; turn key rules / warnings / tips into callouts (warning for must-not-do, info for tips, success for best practices).
- Preserve the document's original language (Chinese source → Chinese output).
- Stay faithful: keep all real facts, names, numbers, and rules; do NOT fabricate new policies or details.
- Do NOT output images, videos, or quizzes. Output at most 40 blocks. JSON only, no prose outside the JSON.`;

interface ChatResponse {
	choices?: { message?: { content?: string } }[];
	usage?: { total_tokens?: number };
}

export interface AgentResult {
	blocks: BlockInput[];
	tokens: number;
}

/** Transform document text into validated blocks via qwen3.7-plus. */
export async function convertWithAgent(text: string): Promise<AgentResult> {
	const key = env.DASHSCOPE_API_KEY;
	if (!key) throw new Error('DASHSCOPE_API_KEY not set');

	const res = await fetch(`${BASE}/chat/completions`, {
		method: 'POST',
		headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			model: MODEL,
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: text.slice(0, 60000) }
			],
			temperature: 0.2,
			// Generous cap so the JSON output is never truncated (this is a reasoning
			// model — reasoning + output must both fit).
			max_tokens: 8192,
			response_format: { type: 'json_object' }
		})
	});
	if (!res.ok) throw new Error(`agent HTTP ${res.status}`);

	const data = (await res.json()) as ChatResponse;
	const content = data.choices?.[0]?.message?.content;
	if (typeof content !== 'string') throw new Error('agent returned no content');

	const parsed = extractJson(content);
	const arr = Array.isArray(parsed)
		? parsed
		: parsed && Array.isArray((parsed as { blocks?: unknown }).blocks)
			? (parsed as { blocks: unknown[] }).blocks
			: null;
	if (!arr) throw new Error('agent returned no blocks array');

	const blocks: BlockInput[] = [];
	for (const candidate of arr) {
		const r = blockInputSchema.safeParse(candidate);
		if (r.success) blocks.push(cleanBlock(r.data));
	}
	const tokens = typeof data.usage?.total_tokens === 'number' ? data.usage.total_tokens : 0;
	return { blocks, tokens };
}

/** Our blocks render as plain text, so strip stray inline-markdown markers the model may emit. */
function stripInlineMd(s: string): string {
	return s.replace(/\*\*/g, '').replace(/__/g, '').replace(/`/g, '').trim();
}
function cleanBlock(b: BlockInput): BlockInput {
	switch (b.type) {
		case 'heading':
		case 'paragraph':
			return { ...b, text: stripInlineMd(b.text) };
		case 'quote':
			return { ...b, text: stripInlineMd(b.text), cite: b.cite ? stripInlineMd(b.cite) : b.cite };
		case 'callout':
			return { ...b, title: stripInlineMd(b.title), body: stripInlineMd(b.body) };
		case 'list':
			return { ...b, items: b.items.map(stripInlineMd) };
		default:
			return b;
	}
}

/** Robustly pull a JSON value out of model output (handles code fences / stray prose). */
function extractJson(content: string): unknown {
	let s = content.trim();
	const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence?.[1]) s = fence[1].trim();
	try {
		return JSON.parse(s);
	} catch {
		// fall through
	}
	const start = s.indexOf('{');
	const end = s.lastIndexOf('}');
	if (start >= 0 && end > start) {
		try {
			return JSON.parse(s.slice(start, end + 1));
		} catch {
			return null;
		}
	}
	return null;
}
