import { json, type RequestHandler } from '@sveltejs/kit';
import { requireEditor } from '$lib/server/guard';
import { isSupported } from '$lib/server/extract';
import { startIngestion, getJob } from '$lib/server/ingest';

const MAX_DOC_BYTES = 50 * 1024 * 1024; // 50 MB

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File)) {
		return json({ ok: false, error: '缺少文件' }, { status: 400 });
	}
	if (!isSupported(file.name)) {
		return json({ ok: false, error: '不支持的文件类型(支持 txt/md/docx/pdf/pptx)' }, { status: 400 });
	}
	if (file.size > MAX_DOC_BYTES) {
		return json({ ok: false, error: '文件过大' }, { status: 413 });
	}
	const buf = Buffer.from(await file.arrayBuffer());
	const jobId = startIngestion(file.name, buf);
	return json({ ok: true, jobId });
};

export const GET: RequestHandler = ({ url, locals }) => {
	requireEditor(locals);
	const job = getJob(url.searchParams.get('jobId') ?? '');
	if (!job) return json({ ok: false }, { status: 404 });
	return json({
		ok: true,
		status: job.status,
		usedAgent: job.usedAgent,
		tokens: job.tokens,
		durationMs: job.durationMs,
		events: job.events,
		blocks: job.blocks,
		error: job.error
	});
};
