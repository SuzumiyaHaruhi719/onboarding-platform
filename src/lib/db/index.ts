import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

/**
 * 数据库客户端。
 *
 * 生产环境部署目标机为 RHEL 8.7(glibc 2.28),真正的 better-sqlite3 原生包的预编译
 * 二进制需要 glibc ≥ 2.29(源码编译又需工具链)→ npm install 失败。
 *
 * 解决:`node_modules/better-sqlite3/` 是一个本地 shim(见该目录 index.mjs),用 Node 22
 * 内置的 node:sqlite(DatabaseSync,零原生编译)重实现 better-sqlite3 被 drizzle 适配器
 * 用到的子集。因此这里的 `import Database from 'better-sqlite3'` 在构建时解析到 shim,
 * 运行时也是 node:sqlite —— 无原生依赖,glibc 2.28 兼容。
 */
const file = process.env.DATABASE_URL ?? 'data.sqlite';

const sqlite = new Database(file);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { schema };
