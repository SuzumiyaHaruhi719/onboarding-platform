#!/usr/bin/env node
/**
 * 一键拉起脚本 / One-click launcher.
 *
 * 干的事:检查 Node 环境 → 装依赖(缺才装)→ 准备 .env → 首次自动建表+填种子
 * → 从 5180 起找一个空闲端口(被占用就自动换并显示)→ 启动 dev server
 * → 服务就绪后在默认浏览器打开。
 *
 * 纯 Node 内置模块,零额外依赖。跨平台(Windows / macOS / Linux)。
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';

const DESIRED_PORT = 5180;
const PORT_SCAN_SPAN = 50; // 5180..5229
const HOST = '127.0.0.1'; // 比 localhost 更稳:不受系统代理(如 Clash)影响
const READY_TIMEOUT_MS = 90_000;

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

async function main() {
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

main().catch((e) => {
	fail(e.message || String(e));
	process.exit(1);
});
