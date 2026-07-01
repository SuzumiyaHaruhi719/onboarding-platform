/**
 * 数据库迁移:用 node:sqlite 直接建表,替代 drizzle-kit db:push。
 *
 * 为什么不用 `drizzle-kit push`:它在内部 `import('better-sqlite3')`(见 drizzle-kit/bin.cjs
 * 的 sqlite 驱动解析链),会触发 better-sqlite3 的原生编译/加载 → glibc 不兼容。本脚本
 * 用 Node 22 内置的 node:sqlite 执行建表 SQL,零原生依赖。
 *
 * 幂等:所有语句用 `CREATE TABLE IF NOT EXISTS`,可安全重复执行。
 * 表结构与 src/lib/db/schema.ts 保持一致(手动同步)。
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// __dirname 是 src/lib/db/;项目根目录是往上 3 级。
const thisDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(thisDir, '../../..');
const file = path.resolve(projectRoot, process.env.DATABASE_URL ?? 'data.sqlite');

const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const ddl = `
CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	name TEXT,
	role TEXT NOT NULL DEFAULT 'learner',
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS modules (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sections (
	id TEXT PRIMARY KEY,
	module_id TEXT NOT NULL REFERENCES modules(id),
	title TEXT NOT NULL,
	sort_order INTEGER NOT NULL,
	min_dwell_ms INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blocks (
	id TEXT PRIMARY KEY,
	section_id TEXT NOT NULL REFERENCES sections(id),
	type TEXT NOT NULL,
	sort_order INTEGER NOT NULL,
	content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quizzes (
	id TEXT PRIMARY KEY,
	section_id TEXT NOT NULL REFERENCES sections(id),
	sort_order INTEGER NOT NULL,
	type TEXT NOT NULL,
	question TEXT NOT NULL,
	options TEXT NOT NULL,
	answer TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_profiles (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	provider TEXT NOT NULL,
	base_url TEXT NOT NULL,
	model TEXT NOT NULL,
	api_key TEXT NOT NULL DEFAULT '',
	timeout_ms INTEGER NOT NULL DEFAULT 60000,
	active INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	section_id TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'in_progress',
	read_pct REAL NOT NULL DEFAULT 0,
	scrolled_to_bottom INTEGER NOT NULL DEFAULT 0,
	dwell_ms INTEGER NOT NULL DEFAULT 0,
	video_intervals TEXT NOT NULL DEFAULT '[]',
	quiz_passed INTEGER NOT NULL DEFAULT 0,
	quiz_passed_ids TEXT NOT NULL DEFAULT '[]',
	quiz_attempts INTEGER NOT NULL DEFAULT 0,
	quiz_locked_until INTEGER,
	started_at INTEGER NOT NULL,
	last_heartbeat_at INTEGER,
	completed_at INTEGER,
	UNIQUE (user_id, section_id)
);
`;

db.exec(ddl);
db.close();

console.log(`[migrate] 表已就绪 ✓ → ${file}`);
