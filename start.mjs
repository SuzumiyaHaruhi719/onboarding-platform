#!/usr/bin/env node
/**
 * 一键拉起脚本 / One-click launcher.
 *
 * 两种运行模式:
 *  - 交互式(默认,人类本地开发):检查 Node 环境 → 装依赖(缺才装)→ 准备 .env
 *    → 首次自动建表+填种子 → 从 5180 起找一个空闲端口 → 启动 dev server
 *    → 服务就绪后在默认浏览器打开。
 *  - 生产/守护模式(NODE_ENV=production 或 ONBOARDING_SERVE=prod):装依赖(缺才装)
 *    → 生产构建(缺/旧才构建)→ 建表(缺才建,绝不 seed)→ 启动 adapter-node 生产服务器
 *    (node build/index.js),绑定 HOST=0.0.0.0、PORT=5180(可被环境变量覆盖)。
 *    供 supervisor / 容器守护:幂等、不装浏览器、不扫端口、失败即退出。
 *
 * 纯 Node 内置模块,零额外依赖。跨平台(Windows / macOS / Linux)。
 *
 * 为什么有生产模式:部署流水线(front_npm_run2)只 rsync 源码(排除 node_modules/.env/.git),
 * 由 supervisor 跑 `npm start` → 本脚本。生产模式让本脚本在裸目标机上自举:
 * 装依赖 → 构建 → 建表 → 起生产服务器,从而无需改 playbook 即可修复 spawn error。
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';

// ── 诊断探针(无条件最先执行)──────────────────────────────────────
// 用途:确认本脚本是否真的被 supervisor 调用、以及调用时的环境。
// 同步写入,任何后续崩溃都不会丢失这条记录。文件 deploy 后即可在目标机读取。
// 排查完毕后可删除本块。
try {
	const probeFile = path.join(root, '.boot-probe.log');
	const redact = (k, v) =>
		/PASS|TOKEN|SECRET|KEY/i.test(k) ? '***' : v;
	const envDump = Object.fromEntries(
		Object.entries(process.env).map(([k, v]) => [k, redact(k, v)])
	);
	const rec =
		`=== ${new Date().toISOString()} ===\n` +
		`argv: ${JSON.stringify(process.argv)}\n` +
		`node: ${process.execPath} (${process.versions.node})\n` +
		`cwd: ${process.cwd()}\n` +
		`root: ${root}\n` +
		`isTTY(stdout): ${!!process.stdout.isTTY}\n` +
		`SUPERVISOR_ENABLED: ${process.env.SUPERVISOR_ENABLED ?? '(unset)'}\n` +
		`NODE_ENV: ${process.env.NODE_ENV ?? '(unset)'}\n` +
		`ONBOARDING_SERVE: ${process.env.ONBOARDING_SERVE ?? '(unset)'}\n` +
		`env: ${JSON.stringify(envDump)}\n\n`;
	fs.appendFileSync(probeFile, rec);
} catch (e) {
	// 探针失败不影响主流程。
}

const DESIRED_PORT = 5180;
const PORT_SCAN_SPAN = 50; // 5180..5229
const HOST = '127.0.0.1'; // 比 localhost 更稳:不受系统代理(如 Clash)影响
const READY_TIMEOUT_MS = 90_000;

/**
 * 生产模式开关。
 * 触发条件(任一即可,覆盖常见守护/容器场景):
 *  - SUPERVISOR_ENABLED=1:supervisord 启动每个 program 时自动注入,无需改配置;
 *  - NODE_ENV=production:通用约定;
 *  - ONBOARDING_SERVE=prod:显式开关;
 *  - 非 TTY(supervisor/容器/systemd 等守护进程均无终端):兜底默认生产,
 *    仅交互式终端(`node start.mjs` 人类运行、双击 start.sh/cmd)才走开发模式。
 *    这是唯一不依赖「守护进程恰好设置了某环境变量」的可靠信号。
 */
const PROD_MODE =
	process.env.SUPERVISOR_ENABLED === '1' ||
	process.env.NODE_ENV === 'production' ||
	process.env.ONBOARDING_SERVE === 'prod' ||
	!process.stdout.isTTY;

function log(msg) {
	console.log(`\x1b[36m[onboarding]\x1b[0m ${msg}`);
}
function warn(msg) {
	console.log(`\x1b[33m[onboarding]\x1b[0m ${msg}`);
}
function fail(msg) {
	console.error(`\x1b[31m[onboarding]\x1b[0m ${msg}`);
}

/**
 * 启动子进程。Windows 下用 shell 跑整行命令字符串(这样 `npm` 能解析到
 * `npm.cmd`,且避免 shell+args 数组的 DEP0190 弃用告警);其它平台直接传 args。
 * parts 全部由本脚本控制(无用户输入),拼接安全。
 */
function launch(parts, env = {}) {
	const opts = { stdio: 'inherit', cwd: root, env: { ...process.env, ...env } };
	return isWin
		? spawn(parts.join(' '), { ...opts, shell: true })
		: spawn(parts[0], parts.slice(1), opts);
}

/** 跑一条命令,继承 stdio,失败抛错。 */
function run(parts, env = {}) {
	return new Promise((resolve, reject) => {
		const child = launch(parts, env);
		child.on('error', reject);
		child.on('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`${parts.join(' ')} 退出码 ${code}`))
		);
	});
}

/**
 * npm 的可执行路径:优先取「当前 node 同目录」下的 npm(避免依赖 supervisor 的 PATH),
 * 找不到才回退裸 'npm'(交给 shell 的 PATH 查找)。Windows 用 npm.cmd。
 */
function npmBin() {
	const nodeDir = path.dirname(process.execPath);
	const cand = isWin ? 'npm.cmd' : 'npm';
	const full = path.join(nodeDir, cand);
	return fs.existsSync(full) ? full : 'npm';
}

/**
 * 生产模式专用的命令运行器:总是用 shell 执行(让 PATH/npm.cmd 解析生效),
 * 并把 stdout+stderr 同时输出到控制台和 start.log,便于排查 supervisor 下的失败。
 * 返回 {code, ok}。parts[0] 若是 'npm' 会替换成 npmBin() 解析出的绝对路径。
 */
function runProd(parts, logStream, env = {}) {
	const parts2 = parts.slice();
	if (parts2[0] === 'npm') parts2[0] = npmBin();
	const cmd = parts2.join(' ');
	const opts = {
		stdio: ['ignore', 'pipe', 'pipe'],
		cwd: root,
		shell: true,
		env: { ...process.env, ...env }
	};
	return new Promise((resolve) => {
		const child = spawn(cmd, opts);
		const line = (b) => b.toString();
		child.stdout.on('data', (d) => {
			process.stdout.write(d);
			logStream.write(line(d));
		});
		child.stderr.on('data', (d) => {
			process.stderr.write(d);
			logStream.write(line(d));
		});
		child.on('error', (e) => {
			logStream.write(`[spawn error] ${e.message}\n`);
			resolve({ code: -1, ok: false, err: e });
		});
		child.on('exit', (code) => resolve({ code: code ?? -1, ok: code === 0 }));
	});
}

/** 端口能否被监听(空闲)。 */
function isPortFree(port) {
	return new Promise((resolve) => {
		const srv = net.createServer();
		srv.once('error', () => resolve(false));
		srv.once('listening', () => srv.close(() => resolve(true)));
		srv.listen(port, HOST);
	});
}

/** 从 start 起找第一个空闲端口。 */
async function findFreePort(start, span) {
	for (let p = start; p < start + span; p++) {
		if (await isPortFree(p)) return p;
	}
	throw new Error(`在 ${start}..${start + span - 1} 范围内没有空闲端口`);
}

/** 轮询 TCP 直到 dev server 可连接(用裸 socket,绕开代理)。 */
function waitForServer(port) {
	const deadline = Date.now() + READY_TIMEOUT_MS;
	return new Promise((resolve, reject) => {
		const tryOnce = () => {
			const sock = net.connect({ port, host: HOST });
			sock.once('connect', () => {
				sock.destroy();
				resolve();
			});
			sock.once('error', () => {
				sock.destroy();
				if (Date.now() > deadline) reject(new Error('等待服务就绪超时'));
				else setTimeout(tryOnce, 300);
			});
		};
		tryOnce();
	});
}

/** 在默认浏览器打开 url。 */
function openBrowser(url) {
	try {
		if (isWin) spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
		else if (process.platform === 'darwin')
			spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
		else spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
	} catch {
		warn(`无法自动打开浏览器,请手动访问 ${url}`);
	}
}

/** 极简 .env 解析(只取我们关心的键)。 */
function parseEnv(file) {
	const out = {};
	if (!fs.existsSync(file)) return out;
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
		if (m && !line.trimStart().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
	}
	return out;
}

/** 取目录下最新文件的 mtime(ms);空目录返回 0。用于判断构建是否过期。 */
function newestMtime(dir) {
	if (!fs.existsSync(dir)) return 0;
	let max = 0;
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		const t = fs.statSync(p).mtimeMs;
		if (t > max) max = t;
	}
	return max;
}

/** 生产构建是否需要(重新)执行:build/index.js 不存在,或比 src/ 旧。 */
function buildStale() {
	const entry = path.join(root, 'build', 'index.js');
	if (!fs.existsSync(entry)) return true;
	const builtAt = fs.statSync(entry).mtimeMs;
	const srcAt = newestMtime(path.join(root, 'src'));
	const svelteCfg = path.join(root, 'svelte.config.js');
	const cfgAt = fs.existsSync(svelteCfg) ? fs.statSync(svelteCfg).mtimeMs : 0;
	const pkgAt = fs.existsSync(path.join(root, 'package.json'))
		? fs.statSync(path.join(root, 'package.json')).mtimeMs
		: 0;
	return builtAt < srcAt || builtAt < cfgAt || builtAt < pkgAt;
}

// ───────────────────────── 生产/守护模式 ─────────────────────────

/** 装依赖(缺才装)。优先 npm ci(锁版本、快),失败回退 npm install。 */
async function ensureDeps(logStream, env = {}) {
	if (fs.existsSync(path.join(root, 'node_modules'))) {
		log('依赖已就绪 ✓');
		return;
	}
	log('node_modules 缺失,安装依赖中……');
	let r = await runProd(['npm', 'ci'], logStream, env);
	if (!r.ok) {
		warn(`npm ci 失败(code ${r.code}),回退 npm install……`);
		r = await runProd(['npm', 'install'], logStream, env);
	}
	if (!r.ok) throw new Error(`安装依赖失败(code ${r.code})`);
}

/** 生产构建(缺/旧才构建)。构建失败时假定 node_modules 损坏(上次安装被中断遗留),
 *  清掉重装后再试一次。 */
async function ensureBuild(logStream, env = {}) {
	if (!buildStale()) {
		log('生产构建已就绪 ✓');
		return;
	}
	log('生产构建缺失或过期,执行 npm run build……');
	let r = await runProd(['npm', 'run', 'build'], logStream, env);
	if (r.ok) return;
	warn(`构建失败(code ${r.code})。假定 node_modules 损坏,清掉重装后重试……`);
	fs.rmSync(path.join(root, 'node_modules'), { recursive: true, force: true });
	fs.rmSync(path.join(root, 'build'), { recursive: true, force: true });
	await ensureDeps(logStream, env);
	r = await runProd(['npm', 'run', 'build'], logStream, env);
	if (!r.ok) throw new Error(`构建失败(code ${r.code})`);
}

/** 建表(缺才建)。绝不 seed,以免清空已有数据。 */
async function ensureDb(logStream, envVars) {
	const dbFile = path.resolve(root, envVars.DATABASE_URL || 'data.sqlite');
	if (fs.existsSync(dbFile)) {
		log('数据库已存在 ✓');
		return;
	}
	log('数据库缺失,执行 db:push 建表……(不 seed,避免覆盖数据)');
	const r = await runProd(['npm', 'run', 'db:push'], logStream, envVars);
	if (!r.ok) throw new Error(`建表失败(code ${r.code})`);
}

/** 启动 adapter-node 生产服务器:node build/index.js,绑定 0.0.0.0:PORT。 */
function serveProd(envVars, logStream) {
	const port = String(envVars.PORT || process.env.PORT || DESIRED_PORT);
	const host = '0.0.0.0'; // 强制绑定所有接口,确保健康检查可达(不受 .env/环境变量覆盖)
	const origin = envVars.ORIGIN || process.env.ORIGIN || `http://${host}:${port}`;
	// 注意:HOST 放在最后,确保不被 ...envVars 或 process.env 中的值覆盖
	// 同时传 HOST 和 ONBOARDING_SVELTEKIT_HOST(envPrefix),双保险
	const prodEnv = {
		PORT: port,
		ORIGIN: origin,
		NODE_ENV: 'production',
		HOST: host,
		ONBOARDING_SVELTEKIT_HOST: host,
		ONBOARDING_SVELTEKIT_PORT: port,
		...envVars,
		HOST: host, // 最终覆盖,必须在最后
		ONBOARDING_SVELTEKIT_HOST: host // envPrefix 版本也必须在最后
	};
	const entry = path.join(root, 'build', 'index.js');
	if (!fs.existsSync(entry)) {
		throw new Error(`找不到生产入口 ${entry}(构建可能失败)`);
	}
	// 强制 patch build/env.js:不管 env_prefix 是什么,直接覆写 env 函数,
	// 让 HOST 永远返回 '0.0.0.0',PORT 永远返回我们设的端口。
	// 这是终极方案:不依赖任何环境变量传递。
	const envJs = path.join(root, 'build', 'env.js');
	logStream.write(`[${new Date().toISOString()}] envJs path: ${envJs}, exists: ${fs.existsSync(envJs)}\n`);
	if (fs.existsSync(envJs)) {
		let content = fs.readFileSync(envJs, 'utf8');
		logStream.write(`[${new Date().toISOString()}] env.js length: ${content.length}, has INJECTED: ${content.includes('INJECTED BY start.mjs')}, env_prefix line: ${(content.match(/const env_prefix = "[^"]*"/) || ['not found'])[0]}\n`);
		// 替换 env 函数:对 HOST/PORT 直接返回硬编码值
		content = content.replace(
			/const env_prefix = "[^"]*"/,
			'const env_prefix = ""'
		);
		// 在 export 之前注入 HOST/PORT 的硬编码覆盖
		const injectCode = `
// === INJECTED BY start.mjs: force HOST=0.0.0.0, PORT=${port} ===
const _origEnv = env;
const _env = function(name, fallback) {
	if (name === 'HOST') return '0.0.0.0';
	if (name === 'PORT') return '${port}';
	return _origEnv(name, fallback);
};
`;
		if (!content.includes('INJECTED BY start.mjs')) {
			// 尝试多种 export 行格式
			const exportPatterns = [
				/export \{ dir, env, env_prefix, timeout_env \};?/,
				/export \{ dir, env, env_prefix \};?/,
				/export \{ env, env_prefix, timeout_env \};?/,
				/export \{ env, env_prefix \};?/,
			];
			let patched = false;
			for (const pat of exportPatterns) {
				if (pat.test(content)) {
					content = content.replace(pat, injectCode + '\nexport { dir, _env as env, env_prefix, timeout_env };');
					patched = true;
					break;
				}
			}
			if (!patched) {
				// 最后手段:在文件末尾追加,用 monkey-patch
				logStream.write(`[${new Date().toISOString()}] WARNING: no export pattern matched! Trying fallback patch...\n`);
				// 直接替换原始 env 函数体
				content = content.replace(
					/function env\(name, fallback\) \{/,
					`function env(name, fallback) { if (name === 'HOST') return '0.0.0.0'; if (name === 'PORT') return '${port}';`
				);
				patched = true;
			}
			fs.writeFileSync(envJs, content, 'utf8');
			log('已 patch build/env.js: 注入 HOST=0.0.0.0 PORT=' + port);
			logStream.write(`[${new Date().toISOString()}] patched build/env.js: HOST=0.0.0.0 PORT=${port} (patched=${patched})\n`);
		} else {
			logStream.write(`[${new Date().toISOString()}] build/env.js already patched, skipping\n`);
		}
	} else {
		logStream.write(`[${new Date().toISOString()}] WARNING: build/env.js NOT FOUND at ${envJs}\n`);
	}
	log(`启动生产服务器:node build/index.js → http://${host}:${port}/`);
	// launch 内部会做 { ...process.env, ...env } — 但 process.env 里可能有 supervisor 的 HOST。
	// 所以这里再包一层,确保 HOST=0.0.0.0 在 process.env 展开之后。
	const serverEnv = { ...process.env, ...prodEnv, HOST: host, ONBOARDING_SVELTEKIT_HOST: host, ONBOARDING_SVELTEKIT_PORT: port };
	logStream.write(`[${new Date().toISOString()}] 启动生产服务器 ${host}:${port} | serverEnv.HOST=${serverEnv.HOST} ONBOARDING_SVELTEKIT_HOST=${serverEnv.ONBOARDING_SVELTEKIT_HOST || '(unset)'}\n`);
	const opts = { stdio: 'inherit', cwd: root, env: serverEnv };
	const server = spawn('node', [entry], opts);
	server.on('error', (e) => {
		fail(`生产服务器启动失败:${e.message}`);
		process.exit(1);
	});
	server.on('exit', (code) => process.exit(code ?? 1));
	// 转发信号,supervisor 优雅重启。
	for (const sig of ['SIGINT', 'SIGTERM']) {
		process.on(sig, () => server.kill(sig));
	}
}

async function serveProdMode() {
	const major = Number(process.versions.node.split('.')[0]);
	if (major < 20) {
		fail(`需要 Node 20 或更高(当前 ${process.versions.node})。`);
		process.exit(1);
	}
	// 打开 start.log(追加),所有自举输出都 tee 进去,supervisor 失败后可读明文原因。
	const logFile = path.join(root, 'start.log');
	const logStream = fs.createWriteStream(logFile, { flags: 'a' });
	const stamp = `[${new Date().toISOString()}] === 生产模式启动 · Node ${process.versions.node} · cwd ${root} ===\n`;
	logStream.write(stamp);
	log(`生产模式 · Node ${process.versions.node}(日志 → start.log)`);

	const envPath = path.join(root, '.env');
	const examplePath = path.join(root, '.env.example');
	if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
		fs.copyFileSync(examplePath, envPath);
		log('已从 .env.example 生成 .env');
	}
	const envVars = parseEnv(envPath);

	try {
		await ensureDeps(logStream, envVars);
		await ensureBuild(logStream, envVars);
		await ensureDb(logStream, envVars);
		serveProd(envVars, logStream);
	} catch (e) {
		const msg = e.message || String(e);
		logStream.write(`[${new Date().toISOString()}] 自举失败: ${msg}\n`);
		logStream.end();
		fail(`自举失败: ${msg}(详见 start.log)`);
		process.exit(1);
	}
}

// ───────────────────────── 交互式开发模式 ─────────────────────────

async function devMode() {
	// 1) Node 版本闸:Vite 8 / Svelte 5 需要 Node 20+。
	const major = Number(process.versions.node.split('.')[0]);
	if (major < 20) {
		fail(`需要 Node 20 或更高(当前 ${process.versions.node})。请到 https://nodejs.org/ 升级。`);
		process.exit(1);
	}
	log(`Node ${process.versions.node} ✓`);

	// 2) .env:没有就从 .env.example 复制一份(AI 转译需填 key,不填则本地兜底)。
	const envPath = path.join(root, '.env');
	const examplePath = path.join(root, '.env.example');
	if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
		fs.copyFileSync(examplePath, envPath);
		log('已从 .env.example 生成 .env(如需 AI 转译,请填入 DASHSCOPE_API_KEY)');
	}
	const envVars = parseEnv(envPath);

	// 3) 依赖:node_modules 缺失才安装。
	if (!fs.existsSync(path.join(root, 'node_modules'))) {
		log('首次运行,安装依赖中(npm install)……');
		await run(['npm', 'install']);
	} else {
		log('依赖已就绪 ✓');
	}

	// 4) 数据库:数据文件不存在 → 建表 + 填种子(只在首次做,避免覆盖已有内容)。
	const dbFile = path.resolve(root, envVars.DATABASE_URL || 'data.sqlite');
	if (!fs.existsSync(dbFile)) {
		log('初始化数据库:建表(db:push)+ 填充示例课程(db:seed)……');
		await run(['npm', 'run', 'db:push'], envVars);
		await run(['npm', 'run', 'db:seed'], envVars);
	} else {
		log('数据库已存在 ✓');
	}

	// 5) 选端口。
	const port = await findFreePort(DESIRED_PORT, PORT_SCAN_SPAN);
	if (port !== DESIRED_PORT) {
		warn(`端口 ${DESIRED_PORT} 被占用,自动切换到 ${port}`);
	}
	const url = `http://${HOST}:${port}/`;

	// 6) 起 dev server(strictPort:端口已预检空闲,若再冲突直接报错而非偷偷换)。
	log(`启动开发服务器:${url}`);
	const dev = launch(['npm', 'run', 'dev', '--', '--port', String(port), '--strictPort'], envVars);
	dev.on('error', (e) => {
		fail(`启动失败:${e.message}`);
		process.exit(1);
	});
	dev.on('exit', (code) => process.exit(code ?? 0));

	// 转发退出信号,确保 Ctrl-C 干净关闭。
	for (const sig of ['SIGINT', 'SIGTERM']) {
		process.on(sig, () => {
			dev.kill(sig);
		});
	}

	// 7) 等服务就绪 → 开浏览器。
	try {
		await waitForServer(port);
		log(`\x1b[32m就绪!\x1b[0m 已在默认浏览器打开 ${url}`);
		log(`(若浏览器没弹出,手动访问 ${url} 即可)`);
		openBrowser(url);
	} catch (e) {
		warn(`未能确认服务就绪(${e.message}),请手动访问 ${url}`);
	}
}

async function main() {
	if (PROD_MODE) {
		await serveProdMode();
	} else {
		await devMode();
	}
}

main().catch((e) => {
	fail(e.message || String(e));
	process.exit(1);
});
