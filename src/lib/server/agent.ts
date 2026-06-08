import { blockInputSchema } from './schemas';
import type { BlockInput } from '$lib/content/types';

const BASE = process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const MODEL = process.env.QWEN_MODEL ?? 'qwen3.7-plus';

/** The multimodal agent (qwen3.7-plus) is configured only when its key is set. */
export function hasAgentKey(): boolean {
	return !!process.env.DASHSCOPE_API_KEY;
}

const SYSTEM_PROMPT = `You convert raw document text into structured content blocks for a corporate onboarding reading website.

Return ONLY a JSON object: {"blocks": Block[]} where each Block is exactly one of:
{"type":"heading","level":2|3,"text":string}
{"type":"paragraph","text":string}
{"type":"list","ordered":boolean,"items":string[]}
{"type":"quote","text":string,"cite"?:string}
{"type":"callout","variant":"info"|"success"|"warning"|"error","title":string,"body":string}

Rules:
- Preserve the document's original language (Chinese stays Chinese).
- Organize content with clear H2/H3 headings and concise paragraphs.
- Use lists where the source enumerates items; use callouts for warnings/tips.
- Do NOT invent facts. Do NOT output images, videos, or quizzes.
- Output at most 40 blocks. Output JSON only, no prose.`;

interface ChatResponse {
	choices?: { message?: { content?: string } }[];
}

/** Transform document text into validated blocks via qwen3.7-plus. */
export async function convertWithAgent(text: string): Promise<BlockInput[]> {
	const key = process.env.DASHSCOPE_API_KEY;
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
			response_format: { type: 'json_object' }
		})
	});
	if (!res.ok) throw new Error(`agent HTTP ${res.status}`);

	const data = (await res.json()) as ChatResponse;
	const content = data.choices?.[0]?.message?.content;
	if (typeof content !== 'string') throw new Error('agent returned no content');

	const parsed: unknown = JSON.parse(content);
	const arr =
		Array.isArray(parsed) ? parsed : Array.isArray((parsed as { blocks?: unknown }).blocks) ? (parsed as { blocks: unknown[] }).blocks : null;
	if (!arr) throw new Error('agent returned no blocks array');

	const blocks: BlockInput[] = [];
	for (const candidate of arr) {
		const r = blockInputSchema.safeParse(candidate);
		if (r.success) blocks.push(r.data);
	}
	return blocks;
}
