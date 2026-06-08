import { eq } from 'drizzle-orm';
import { db, schema } from '../src/lib/db/index';

const CJK = '[\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffef]';
const cjkSpace = new RegExp(`(${CJK}) +(?=${CJK})`, 'g');

function clean(s: unknown): unknown {
	if (typeof s !== 'string') return s;
	let o = s
		.replace(/\{#[^}]*\}/g, '')
		.replace(/\*\*|__|`/g, '')
		.replace(/[ \t]+/g, ' ');
	o = o.replace(cjkSpace, '$1');
	return o.trim();
}

const rows = db.select().from(schema.blocks).all();
let n = 0;
for (const b of rows) {
	let d: Record<string, unknown>;
	try {
		d = JSON.parse(b.content);
	} catch {
		continue;
	}
	const before = JSON.stringify(d);
	for (const k of ['text', 'title', 'body', 'cite', 'alt', 'caption']) {
		if (typeof d[k] === 'string') d[k] = clean(d[k]);
	}
	if (Array.isArray(d.items)) d.items = d.items.map(clean);
	const after = JSON.stringify(d);
	if (after !== before) {
		db.update(schema.blocks).set({ content: after }).where(eq(schema.blocks.id, b.id)).run();
		n++;
	}
}
process.stdout.write(`cleaned ${n} / ${rows.length} blocks\n`);
