import { randomUUID } from 'node:crypto';
import { extractText } from './extract';
import { convertWithAgent, hasAgentKey } from './agent';
import { mdToBlocks, textToBlocks, blocksToMarkdown } from './converter';
import { blockInputSchema } from './schemas';
import type { BlockInput } from '$lib/content/types';

export type JobStatus = 'pending' | 'extracting' | 'converting' | 'ready' | 'error';

export interface IngestEvent {
	t: number; // ms since job start
	msg: string;
}

export interface IngestJob {
	status: JobStatus;
	usedAgent: boolean;
	tokens: number;
	startedAt: number;
	durationMs: number;
	events: IngestEvent[];
	/** Converted blocks awaiting user-chosen insertion (NOT yet saved). */
	blocks: BlockInput[];
	error?: string;
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
	const log = (msg: string): void => {
		job.events.push({ t: Date.now() - job.startedAt, msg });
	};
	try {
		log(`已接收文件「${filename}」,开始处理`);
		job.status = 'extracting';
		const { content, markdown } = await extractText(filename, buf);
		if (!content.trim()) throw new Error('未能从文件中提取到文本');
		log(`提取文本完成 · ${content.length} 字`);

		job.status = 'converting';
		let blocks: BlockInput[] = [];
		if (hasAgentKey()) {
			log('调用多模态 agent(qwen3.7-plus)转译为可读章节…');
			try {
				const result = await convertWithAgent(content);
				if (result.blocks.length > 0) {
					blocks = result.blocks;
					job.tokens = result.tokens;
					job.usedAgent = true;
					log(`AI 转译完成 · ${blocks.length} 块 · ${result.tokens} tokens`);
				} else {
					log('AI 未返回有效内容,改用本地解析');
				}
			} catch (e) {
				log('AI 转译失败(' + (e instanceof Error ? e.message : '未知') + '),改用本地解析');
			}
		} else {
			log('未配置 AI 密钥,使用本地解析(可读性有限)');
		}
		if (blocks.length === 0) {
			blocks = localFallback(markdown, content);
			log(`本地解析完成 · ${blocks.length} 块`);
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
			log('没有可用的内容');
		} else {
			job.status = 'ready';
			log(`转译完成,已生成可编辑富文本(${valid.length} 段),等待选择插入位置`);
		}
	} catch (e) {
		job.status = 'error';
		job.error = e instanceof Error ? e.message : '转译失败';
		job.durationMs = Date.now() - job.startedAt;
		log('出错:' + job.error);
	}
}
