// 本地 better-sqlite3 兼容 shim:用 node:sqlite 重新导出,
// 让 drizzle-orm/better-sqlite3 适配器在构建时能解析 `import Database from 'better-sqlite3'`,
// 而无需安装真正的 better-sqlite3 原生包(其预编译二进制不兼容 RHEL 8.7 的 glibc 2.28)。
//
// 注意:这不是完整的 better-sqlite3 API 重实现,只覆盖 drizzle 适配器用到的子集:
// new Database(path), .prepare(sql), .exec(sql), .pragma(), 语句的 .run/.all/.get/.raw()。
import { DatabaseSync } from 'node:sqlite';

function wrapStmt(s) {
	return {
		run: (...p) => s.run(...p),
		all: (...p) => s.all(...p),
		get: (...p) => s.get(...p),
		raw: () => ({
			all: (...p) => s.all(...p).map((r) => Object.values(r)),
			get: (...p) => {
				const r = s.get(...p);
				return r ? Object.values(r) : undefined;
			}
		}),
		bind: (...p) => ({
			all: () => s.all(...p),
			get: () => s.get(...p),
			run: () => s.run(...p)
		})
	};
}

export default class Database {
	constructor(file) {
		this._db = new DatabaseSync(file);
	}
	prepare(sql) {
		return wrapStmt(this._db.prepare(sql));
	}
	exec(sql) {
		return this._db.exec(sql);
	}
	pragma(q) {
		try {
			this._db.exec('PRAGMA ' + q);
		} catch {
			/* ignore */
		}
	}
	close() {
		return this._db.close();
	}
	transaction(fn) {
		this._db.exec('BEGIN');
		try {
			// drizzle 期望回调接收一个事务上下文对象,
			// 该对象需要有和 db 相同的 prepare/insert/update/delete 等方法。
			// 由于我们的 shim 是薄包装,直接传 this 即可。
			const r = fn(this);
			this._db.exec('COMMIT');
			return r;
		} catch (e) {
			try { this._db.exec('ROLLBACK'); } catch {}
			throw e;
		}
	}
}
