import { extname } from 'node:path';
import { convert } from 'officeparser';

const SUPPORTED_EXT = ['.txt', '.md', '.markdown', '.docx', '.pdf', '.pptx', '.xlsx'];

export function isSupported(filename: string): boolean {
	return SUPPORTED_EXT.includes(extname(filename).toLowerCase());
}

export interface Extracted {
	content: string;
	/** True when `content` is Markdown (preserves headings/lists for the local fallback). */
	markdown: boolean;
}

/** Extract text/markdown from an uploaded document. */
export async function extractText(filename: string, buf: Buffer): Promise<Extracted> {
	const ext = extname(filename).toLowerCase();
	if (ext === '.txt') return { content: buf.toString('utf8'), markdown: false };
	if (ext === '.md' || ext === '.markdown') return { content: buf.toString('utf8'), markdown: true };

	// docx / pdf / pptx / xlsx → Markdown via officeparser (parse + generate in one step)
	const out = (await convert(buf, 'md')) as { value?: unknown };
	return { content: typeof out.value === 'string' ? out.value : '', markdown: true };
}
