import { blockInputSchema } from './schemas';
import type { BlockInput } from '$lib/content/types';

const BASE = process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const MODEL = process.env.QWEN_MODEL ?? 'qwen3.7-plus';

/** The multimodal agent (qwen3.7-plus) is configured only when its key is set. */
export function hasAgentKey(): boolean {
	return !!process.env.DASHSCOPE_API_KEY;
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
	const tokens = typeof data.usage?.total_tokens === 'number' ? data.usage.total_tokens : 0;
	return { blocks, tokens };
}
