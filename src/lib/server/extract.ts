import { extname } from 'node:path';
import { convert } from 'officeparser';

const SUPPORTED_EXT = ['.txt', '.md', '.markdown', '.docx', '.pdf', '.pptx', '.xlsx'];

/** Hard cap on document parsing — slow/complex files fail fast instead of hanging. */
const EXTRACT_TIMEOUT_MS = 90_000;

export function isSupported(filename: string): boolean {
	return SUPPORTED_EXT.includes(extname(filename).toLowerCase());
}

export interface Extracted {
	content: string;
	/** True when `content` is Markdown (preserves headings/lists for the local fallback). */
	markdown: boolean;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(message)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Extract text/markdown from an uploaded document. */
export async function extractText(filename: string, buf: Buffer): Promise<Extracted> {
	const ext = extname(filename).toLowerCase();
	if (ext === '.txt') return { content: buf.toString('utf8'), markdown: false };
	if (ext === '.md' || ext === '.markdown') return { content: buf.toString('utf8'), markdown: true };

	// docx / pdf / pptx / xlsx → Markdown via officeparser. We only need text, so
	// skip OCR and image extraction (the slow parts for image-heavy PDFs/PPTX).
	const result = convert(buf, 'md', {
		parseConfig: { ocr: false },
		generatorConfig: { includeImages: false }
	}) as Promise<{ value?: unknown }>;

	const out = await withTimeout(
		result,
		EXTRACT_TIMEOUT_MS,
		'文档解析超时(文件可能过大或过于复杂,建议精简后重试,或转存为 DOCX / Markdown)'
	);
	return { content: typeof out.value === 'string' ? out.value : '', markdown: true };
}
