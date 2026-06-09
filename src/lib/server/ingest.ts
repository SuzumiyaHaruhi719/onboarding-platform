import { randomUUID } from 'node:crypto';
import { extractText } from './extract';
import { convertWithAgent, hasAgentKey } from './agent';
import { mdToBlocks, textToBlocks, blocksToMarkdown, cleanExtractedSource } from './converter';
import { blockInputSchema } from './schemas';
import type { BlockInput } from '$lib/content/types';

export type JobStatus = 'pending' | 'extracting' | 'converting' | 'ready' | 'error';

export interface IngestEvent {
	t: number; // ms since job start
	msg: string;
	msgEn?: string;
}

export interface IngestJob {
	status: JobStatus;
	usedAgent: boolean;
	tokens: number;
	model: string;
	startedAt: number;
	durationMs: number;
	events: IngestEvent[];
	/** Converted document content awaiting user-chosen insertion (NOT yet saved). */
	blocks: BlockInput[];
	error?: string;
	errorEn?: string;
}

// In-memory job registry (single-process adapter-node).
const jobs = new Map<string, IngestJob>();

export function getJob(id: string): IngestJob | undefined {
	return jobs.get(id);
}

export function startIngestion(filename: string, buf: Buffer): string {
	const jobId = randomUUID();
	jobs.set(jobId, {
		status: 'pending',
		usedAgent: false,
		tokens: 0,
		model: '',
		startedAt: Date.now(),
		durationMs: 0,
		events: [],
		blocks: []
	});
	void run(jobId, filename, buf);
	return jobId;
}

function localFallback(markdown: boolean, content: string): BlockInput[] {
	return markdown ? mdToBlocks(content) : textToBlocks(content);
}

async function run(jobId: string, filename: string, buf: Buffer): Promise<void> {
	const job = jobs.get(jobId);
	if (!job) return;
	const log = (msg: string, msgEn?: string): void => {
		job.events.push({ t: Date.now() - job.startedAt, msg, msgEn });
	};
	try {
		log(`已接收文件「${filename}」，开始处理`, `Received "${filename}". Processing started`);
		job.status = 'extracting';
		const { content, markdown } = await extractText(filename, buf);
		const cleanContent = cleanExtractedSource(content);
		if (!cleanContent.trim()) throw new Error('未能从文件中提取到文本');
		log(`提取文本完成 · ${cleanContent.length} 字`, `Text extracted · ${cleanContent.length} characters`);

		job.status = 'converting';
		let blocks: BlockInput[] = [];
		if (hasAgentKey()) {
			log('调用 AI 模型转译为可读章节…', 'Calling the AI model to translate into readable sections...');
			try {
				const result = await convertWithAgent(cleanContent);
				if (result.blocks.length > 0) {
					blocks = result.blocks;
					job.tokens = result.tokens;
					job.model = result.model;
					job.usedAgent = true;
					log(`AI 转译完成 · ${result.model} · ${blocks.length} 段 · ${result.tokens} tokens`, `AI translation complete · ${result.model} · ${blocks.length} sections · ${result.tokens} tokens`);
				} else {
					log('AI 未返回有效内容，改用本地解析', 'AI returned no usable content. Falling back to local parsing');
				}
			} catch (e) {
				const reason = e instanceof Error ? e.message : '未知';
				log(`AI 转译失败(${reason})，改用本地解析`, `AI translation failed (${reason}). Falling back to local parsing`);
			}
		} else {
			log('未配置 AI 密钥，使用本地解析(可读性有限)', 'No AI key configured. Using local parsing with limited readability');
		}
		if (blocks.length === 0) {
			blocks = localFallback(markdown, cleanContent);
			log(`本地解析完成 · ${blocks.length} 段`, `Local parsing complete · ${blocks.length} sections`);
		}

		// Collapse the converted content into a single editable Markdown rich-text
		// block (Markdown is the storage foundation). Do NOT save — await user choice.
		const valid = blocks.filter((b) => blockInputSchema.safeParse(b).success);
		const mdDoc = blocksToMarkdown(valid);
		job.blocks = mdDoc.trim() ? [{ type: 'richtext', markdown: mdDoc }] : [];
		job.durationMs = Date.now() - job.startedAt;
		if (job.blocks.length === 0) {
			job.status = 'error';
			job.error = '没有可用的内容';
			job.errorEn = 'No usable content';
			log('没有可用的内容', 'No usable content');
		} else {
			job.status = 'ready';
			log(`转译完成，已生成可编辑富文本(${valid.length} 段)，等待选择插入位置`, `Translation complete. Editable rich text generated (${valid.length} paragraphs). Choose an insertion point`);
		}
	} catch (e) {
		job.status = 'error';
		job.error = e instanceof Error ? e.message : '转译失败';
		job.errorEn = e instanceof Error ? e.message : 'Translation failed';
		job.durationMs = Date.now() - job.startedAt;
		log('出错：' + job.error, 'Error: ' + job.errorEn);
	}
}
