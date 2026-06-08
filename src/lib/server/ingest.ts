import { randomUUID } from 'node:crypto';
import { extractText } from './extract';
import { convertWithAgent, hasAgentKey } from './agent';
import { mdToBlocks, textToBlocks } from './converter';
import { createBlock } from './editor';
import { blockInputSchema } from './schemas';
import type { BlockInput } from '$lib/content/types';

export type JobStatus = 'pending' | 'extracting' | 'converting' | 'saving' | 'done' | 'error';

export interface IngestJob {
	status: JobStatus;
	blocksCreated: number;
	usedAgent: boolean;
	tokens: number;
	startedAt: number;
	durationMs: number;
	error?: string;
}

// In-memory job registry (single-process adapter-node). A durable jobs table is
// a future enhancement for multi-instance deployments.
const jobs = new Map<string, IngestJob>();

export function getJob(id: string): IngestJob | undefined {
	return jobs.get(id);
}

export function startIngestion(sectionId: string, filename: string, buf: Buffer): string {
	const jobId = randomUUID();
	jobs.set(jobId, {
		status: 'pending',
		blocksCreated: 0,
		usedAgent: false,
		tokens: 0,
		startedAt: Date.now(),
		durationMs: 0
	});
	void run(jobId, sectionId, filename, buf);
	return jobId;
}

function localFallback(markdown: boolean, content: string): BlockInput[] {
	return markdown ? mdToBlocks(content) : textToBlocks(content);
}

async function run(jobId: string, sectionId: string, filename: string, buf: Buffer): Promise<void> {
	const job = jobs.get(jobId);
	if (!job) return;
	const finish = (status: JobStatus, error?: string): void => {
		job.status = status;
		job.durationMs = Date.now() - job.startedAt;
		if (error) job.error = error;
	};
	try {
		job.status = 'extracting';
		const { content, markdown } = await extractText(filename, buf);
		if (!content.trim()) throw new Error('未能从文件中提取到文本');

		job.status = 'converting';
		let blocks: BlockInput[] = [];
		if (hasAgentKey()) {
			job.usedAgent = true;
			try {
				const result = await convertWithAgent(content);
				blocks = result.blocks;
				job.tokens = result.tokens;
			} catch {
				blocks = [];
			}
			// Agent failed or returned nothing → fall back to deterministic local parsing.
			if (blocks.length === 0) blocks = localFallback(markdown, content);
		} else {
			blocks = localFallback(markdown, content);
		}

		job.status = 'saving';
		let created = 0;
		for (const candidate of blocks) {
			const r = blockInputSchema.safeParse(candidate);
			if (r.success) {
				createBlock(sectionId, r.data);
				created++;
			}
		}
		job.blocksCreated = created;
		finish(created > 0 ? 'done' : 'error', created === 0 ? '没有可用的内容块' : undefined);
	} catch (e) {
		finish('error', e instanceof Error ? e.message : '转译失败');
	}
}
