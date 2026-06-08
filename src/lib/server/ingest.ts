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
	jobs.set(jobId, { status: 'pending', blocksCreated: 0, usedAgent: false });
	void run(jobId, sectionId, filename, buf);
	return jobId;
}

function localFallback(markdown: boolean, content: string): BlockInput[] {
	return markdown ? mdToBlocks(content) : textToBlocks(content);
}

async function run(jobId: string, sectionId: string, filename: string, buf: Buffer): Promise<void> {
	const job = jobs.get(jobId);
	if (!job) return;
	try {
		job.status = 'extracting';
		const { content, markdown } = await extractText(filename, buf);
		if (!content.trim()) throw new Error('未能从文件中提取到文本');

		job.status = 'converting';
		let blocks: BlockInput[] = [];
		if (hasAgentKey()) {
			job.usedAgent = true;
			try {
				blocks = await convertWithAgent(content);
			} catch {
				blocks = [];
			}
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
		job.status = created > 0 ? 'done' : 'error';
		if (created === 0) job.error = '没有可用的内容块';
	} catch (e) {
		job.status = 'error';
		job.error = e instanceof Error ? e.message : '转译失败';
	}
}
