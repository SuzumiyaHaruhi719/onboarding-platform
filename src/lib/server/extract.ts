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

interface PdfTextItem {
	str?: string;
	hasEOL?: boolean;
}
interface PdfModule {
	getDocument: (src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean }) => {
		promise: Promise<{
			numPages: number;
			getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: PdfTextItem[] }> }>;
		}>;
		destroy: () => Promise<void>;
	};
}

/** Fast, dependency-light PDF text extraction via PDF.js (lazy-loaded). */
async function pdfToText(buf: Buffer): Promise<string> {
	const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfModule;
	const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true });
	const doc = await task.promise;
	try {
		const pages: string[] = [];
		for (let i = 1; i <= doc.numPages; i++) {
			const page = await doc.getPage(i);
			const content = await page.getTextContent();
			let pageText = '';
			for (const item of content.items) {
				if (typeof item.str === 'string') pageText += item.str + (item.hasEOL ? '\n' : ' ');
			}
			pages.push(pageText.trim());
		}
		return pages.join('\n\n');
	} finally {
		await task.destroy();
	}
}

/** Extract text/markdown from an uploaded document. */
export async function extractText(filename: string, buf: Buffer): Promise<Extracted> {
	const ext = extname(filename).toLowerCase();
	if (ext === '.txt') return { content: buf.toString('utf8'), markdown: false };
	if (ext === '.md' || ext === '.markdown') return { content: buf.toString('utf8'), markdown: true };

	if (ext === '.pdf') {
		const content = await withTimeout(
			pdfToText(buf),
			EXTRACT_TIMEOUT_MS,
			'PDF 解析超时(文件可能过大或为扫描件,建议精简或转存为 DOCX / Markdown)'
		);
		return { content, markdown: false };
	}

	// docx / pptx / xlsx → Markdown via officeparser (skip OCR + image extraction)
	const result = convert(buf, 'md', {
		parseConfig: { ocr: false },
		generatorConfig: { includeImages: false }
	}) as Promise<{ value?: unknown }>;
	const out = await withTimeout(
		result,
		EXTRACT_TIMEOUT_MS,
		'文档解析超时(文件可能过大或过于复杂,建议转存为 DOCX / Markdown)'
	);
	return { content: typeof out.value === 'string' ? out.value : '', markdown: true };
}
