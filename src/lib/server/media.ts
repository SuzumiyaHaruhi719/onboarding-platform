import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile, readFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? 'uploads';

const MEDIA_TYPES: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.mp4': 'video/mp4',
	'.m4v': 'video/mp4',
	'.webm': 'video/webm',
	'.ogg': 'video/ogg',
	'.mov': 'video/quicktime'
};

export const MAX_MEDIA_BYTES = 200 * 1024 * 1024; // 200 MB

function ensureDir(): void {
	if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
}

export async function saveMedia(file: File): Promise<string> {
	const ext = extname(file.name).toLowerCase();
	if (!MEDIA_TYPES[ext]) throw new Error('unsupported media type');
	ensureDir();
	const filename = randomUUID() + ext;
	await writeFile(join(UPLOAD_DIR, filename), Buffer.from(await file.arrayBuffer()));
	return filename;
}

export async function readMedia(name: string): Promise<{ data: Buffer; type: string } | null> {
	const safe = basename(name); // strip path components; no traversal
	const type = MEDIA_TYPES[extname(safe).toLowerCase()];
	if (!type) return null;
	const path = join(UPLOAD_DIR, safe);
	if (!existsSync(path)) return null;
	return { data: await readFile(path), type };
}
