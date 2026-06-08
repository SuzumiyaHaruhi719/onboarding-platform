import type { Cookies } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/db';

const UID_COOKIE = 'uid';
export type Role = 'learner' | 'editor';

/**
 * Resolve (or create) the anonymous user id for this browser. P1 has no real
 * auth — identity is an opaque cookie + a users row. P4 will sign/replace this.
 */
export function ensureUid(cookies: Cookies): string {
	let uid = cookies.get(UID_COOKIE);
	if (!uid) {
		uid = randomUUID();
		cookies.set(UID_COOKIE, uid, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 365
		});
		db.insert(schema.users).values({ id: uid, role: 'learner', createdAt: Date.now() }).run();
		return uid;
	}
	// Cookie may outlive a DB reset — make sure a row exists.
	const exists = db
		.select({ id: schema.users.id })
		.from(schema.users)
		.where(eq(schema.users.id, uid))
		.get();
	if (!exists) {
		db.insert(schema.users).values({ id: uid, role: 'learner', createdAt: Date.now() }).run();
	}
	return uid;
}

export function getRole(uid: string): Role {
	const u = db.select().from(schema.users).where(eq(schema.users.id, uid)).get();
	return u?.role ?? 'learner';
}

export function setRole(uid: string, role: Role): void {
	db.insert(schema.users)
		.values({ id: uid, role, createdAt: Date.now() })
		.onConflictDoUpdate({ target: schema.users.id, set: { role } })
		.run();
}
