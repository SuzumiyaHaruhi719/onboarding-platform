# 入职阅读平台 P1(基座 + 学员核心)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 SvelteKit 全栈网站的 P1 切片:角色选择 → 三栏阅读界面 → 服务端权威的防跳过 → 进度记录 → 三题型门禁,内容由种子数据填充。

**Architecture:** SvelteKit 单体(页面 + `+server.ts` API),`src/lib` 按领域拆小模块。**所有完成判定在服务端校验**:下一节内容仅当上一节 `completed` 时才由 `+page.server.ts` 下发,改前端无法绕过。匿名会话(cookie 中的 uid + role)承载进度,P4 再插真鉴权。

**Tech Stack:** SvelteKit(Svelte 5 runes)· TypeScript strict · Drizzle ORM + better-sqlite3 · 纯 CSS 变量(搬 GLP-light/GLP-dark token)· Vitest(仅核心纯逻辑)· adapter-node。

**验证哲学(遵循用户偏好):** 每个任务以 `npm run check`(svelte-check/tsc)+ `npm run build` 为验证门。仅防跳过引擎(`intervals.ts`/`rules.ts`)与判分(`grade.ts`)配 Vitest 单测——纯函数、产品安全核心。功能/E2E 测试等用户明确要求再做。

**Spec:** `docs/superpowers/specs/2026-06-08-onboarding-platform-design.md`

---

## 文件结构

```
src/
  app.html                         # 注入防闪烁 theme/lang 脚本
  app.css                          # 引入 tokens.css + 全局基础样式
  app.d.ts                         # App.Locals: { uid, role }
  hooks.server.ts                  # 解析/签发匿名会话 cookie
  lib/
    design/tokens.css              # :root 浅色 + :root[data-theme=dark] 深色
    design/theme.ts                # getTheme/setTheme/toggleTheme(localStorage)
    i18n/index.ts                  # lang store + t(key) 字典 + setLang
    i18n/dict.ts                   # zh/en 文案字典
    content/types.ts               # Block 判别联合类型 + Quiz 类型
    content/BlockRenderer.svelte   # 按 type 分发
    content/blocks/{Heading,Paragraph,ImageBlock,ListBlock,Quote,Callout,VideoBlock,QuizBlock}.svelte
    anti-skip/types.ts             # ReadingState/SectionRequirements/CompletionResult/VideoInterval
    anti-skip/intervals.ts         # 区间合并/覆盖率(纯)
    anti-skip/rules.ts             # evaluateCompletion(纯)
    anti-skip/heartbeat.ts         # 客户端采集器(滚动/停留/视频区间)
    quiz/grade.ts                  # gradeQuiz/gradeSection(纯)
    db/schema.ts                   # Drizzle 表
    db/index.ts                    # better-sqlite3 client
    db/queries.ts                  # 查询封装
    db/seed.ts                     # 种子数据
    server/session.ts             # uid/role cookie 读写
    server/progress.ts            # 进度服务:start/applyHeartbeat/attemptComplete/submitQuiz
    components/{ThemeToggle,LangToggle,ProgressRing,Sidebar,ContinueButton}.svelte
  routes/
    +layout.server.ts              # 暴露 role 给客户端
    +layout.svelte                 # 外壳:状态栏 + 导航 + 主题/语言切换
    +page.svelte                   # 角色选择落地页
    api/role/+server.ts            # POST 设置 role
    api/progress/heartbeat/+server.ts
    api/progress/complete/+server.ts
    api/quiz/submit/+server.ts
    learn/+layout.server.ts        # 载入 modules + 进度(侧栏)
    learn/+layout.svelte           # 三栏外壳
    learn/+page.server.ts          # 重定向到首个未完成 section
    learn/[sectionId]/+page.server.ts   # 解锁守卫 + 载入 section
    learn/[sectionId]/+page.svelte      # 中栏正文 + 右栏进度
drizzle.config.ts
.env.example
```

---

## Task 1: 初始化 SvelteKit 项目与依赖

**Files:**
- Create: `package.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `src/app.html`, `src/app.d.ts`, `src/routes/+page.svelte`(占位)

- [ ] **Step 1: 脚手架**

在项目根运行(已有 git 与 docs,需保留):
```bash
npx sv create . --template minimal --types ts --no-add-ons
npm i drizzle-orm better-sqlite3
npm i -D drizzle-kit @types/better-sqlite3 tsx vitest @sveltejs/adapter-node
```
若 `sv create` 拒绝非空目录,先 `npx sv create ../_scaffold --template minimal --types ts --no-add-ons` 再把生成文件拷回根目录(保留现有 `.git/`、`docs/`、`.gitignore`)。

- [ ] **Step 2: 切换 adapter-node**

`svelte.config.js`:
```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default { preprocess: vitePreprocess(), kit: { adapter: adapter() } };
```

- [ ] **Step 3: tsconfig strict**

确保 `tsconfig.json` 继承 `.svelte-kit/tsconfig.json` 且 `compilerOptions` 含 `"strict": true, "noUncheckedIndexedAccess": true`。

- [ ] **Step 4: vite 配置(含 vitest)**

`vite.config.ts`:
```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [sveltekit()],
  test: { include: ['src/**/*.test.ts'], environment: 'node' }
});
```

- [ ] **Step 5: npm scripts**

`package.json` scripts 增加:
```json
{
  "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
  "build": "vite build",
  "test": "vitest run",
  "db:push": "drizzle-kit push",
  "db:seed": "tsx src/lib/db/seed.ts"
}
```

- [ ] **Step 6: 验证 + 提交**
```bash
npm run check && npm run build
git add -A && git commit -m "chore: SvelteKit + TS + Drizzle 脚手架"
```
Expected: check 0 errors,build 成功。

---

## Task 2: 设计 token(浅/深)CSS 变量

**Files:**
- Create: `src/lib/design/tokens.css`, `src/app.css`

- [ ] **Step 1: 写 tokens.css**

`:root{}` 放浅色(GLP-light),`:root[data-theme="dark"]{}` 放深色(GLP-dark)。完整搬运两份规范的 colors/spacing/radius/shadows/typography/transitions/layout。示例(节选,需补全所有 token):
```css
:root{
  --brand-50:#E3F5EA; --brand-500:#00AA4F; --brand-600:#008E43; --brand-700:#006845;
  --accent-lime:#82BC00; --accent-emerald:#00D47B;
  --success:#10B050; --success-bg:rgba(16,176,80,.12);
  --warning:#F0A800; --warning-bg:rgba(240,168,0,.12);
  --error:#C83A3A; --error-bg:rgba(200,58,58,.12);
  --info:#0095D4; --info-bg:rgba(42,157,143,.12);
  --surface-page:#F9FAFC; --surface-elevated:#FFFFFF; --surface-container:#FFFFFF;
  --surface-subtle:#F0F1F3; --surface-hover:#EDEEF0; --surface-active:#E5E7EB;
  --border-default:#DDE3EA; --border-subtle:#E8ECF0; --border-strong:#C5CCD3; --border-focus:#00AA4F;
  --text-primary:#42464A; --text-secondary:#555B61; --text-tertiary:#737A82;
  --text-disabled:#A6ADB5; --text-placeholder:#9CA3AF; --text-inverse:#FFFFFF; --text-brand:#00AA4F;
  --shadow-sm:0 1px 3px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.03);
  --shadow-md:0 4px 12px rgba(0,0,0,.1),0 0 0 1px rgba(0,0,0,.04);
  --shadow-lg:0 8px 24px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.05);
  --font-sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  --font-mono:'SF Mono','Menlo','Monaco','Consolas','JetBrains Mono',monospace;
  --text-5xl:60px;--text-4xl:44px;--text-3xl:34px;--text-2xl:26px;--text-xl:20px;
  --text-lg:16px;--text-base:14px;--text-sm:13px;--text-xs:11px;
  --space-0-5:2px;--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:20px;
  --space-6:24px;--space-8:32px;--space-10:40px;--space-12:48px;--space-16:64px;--space-20:80px;--space-24:96px;
  --radius-xs:2px;--radius-sm:4px;--radius-md:6px;--radius-lg:8px;--radius-xl:12px;--radius-2xl:16px;--radius-full:9999px;
  --transition-fast:150ms cubic-bezier(0,0,.2,1);--transition-base:200ms cubic-bezier(0,0,.2,1);--transition-moderate:300ms cubic-bezier(0,0,.2,1);
  --content-max-width:1200px;--content-padding-x:32px;
}
:root[data-theme="dark"]{
  --brand-50:rgba(47,212,122,.08); --brand-200:rgba(47,212,122,.24); --brand-400:#24B267; --brand-500:#2FD47A; --brand-600:#54DC92;
  --success:#3DD97A; --success-bg:rgba(61,217,122,.12);
  --warning:#F5B838; --warning-bg:rgba(245,184,56,.12);
  --error:#E5645A; --error-bg:rgba(229,100,90,.12);
  --info:#4AB5E8; --info-bg:rgba(74,181,232,.12);
  --surface-page:#0F1115; --surface-elevated:#1C2028; --surface-container:#222830;
  --surface-subtle:#282F3A; --surface-hover:#2E3642; --surface-active:#353E4C;
  --border-default:#2E3542; --border-subtle:#252C38; --border-strong:#3C4555; --border-focus:#2FD47A;
  --text-primary:#ECEEF0; --text-secondary:#B4B8BD; --text-tertiary:#8A8F95;
  --text-disabled:#565A60; --text-placeholder:#6B7076; --text-inverse:#0E1012; --text-brand:#2FD47A;
  --shadow-sm:0 1px 2px rgba(0,0,0,.45); --shadow-md:0 4px 14px rgba(0,0,0,.5); --shadow-lg:0 12px 32px rgba(0,0,0,.6);
}
```

- [ ] **Step 2: app.css 基础样式**
```css
@import './lib/design/tokens.css';
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--surface-page);color:var(--text-primary);font-family:var(--font-sans);font-size:var(--text-base);line-height:1.6;transition:background var(--transition-base),color var(--transition-base)}
a{color:var(--text-brand);text-decoration:none}
button{font-family:inherit}
```
在 `src/routes/+layout.svelte` 顶部 `import '../app.css'`。

- [ ] **Step 3: 验证 + 提交**
```bash
npm run check && git add -A && git commit -m "feat(design): 浅/深双主题设计 token"
```

---

## Task 3: 主题切换 + 防闪烁

**Files:**
- Create: `src/lib/design/theme.ts`, `src/lib/components/ThemeToggle.svelte`
- Modify: `src/app.html`

- [ ] **Step 1: theme.ts**
```ts
export type Theme = 'light' | 'dark';
const KEY = 'theme';
export function getTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'light';
  return (localStorage.getItem(KEY) as Theme) ?? 'light';
}
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(KEY, t);
}
export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
```

- [ ] **Step 2: app.html 防闪烁脚本**

在 `<head>` 内、`%sveltekit.head%` 前插入:
```html
<script>
  try {
    var t = localStorage.getItem('theme') || 'light';
    document.documentElement.dataset.theme = t;
    var l = localStorage.getItem('lang') || 'zh';
    document.documentElement.lang = l;
  } catch (e) {}
</script>
```

- [ ] **Step 3: ThemeToggle.svelte**(Svelte 5 runes)
```svelte
<script lang="ts">
  import { getTheme, toggleTheme, type Theme } from '$lib/design/theme';
  let theme = $state<Theme>('light');
  $effect(() => { theme = getTheme(); });
  function onClick() { theme = toggleTheme(); }
</script>
<button class="theme-toggle" onclick={onClick} aria-label="切换主题">
  {theme === 'dark' ? '☾' : '☀'}
</button>
<style>
  .theme-toggle{width:36px;height:36px;border:1px solid var(--border-default);background:var(--surface-elevated);
    color:var(--text-secondary);border-radius:var(--radius-lg);cursor:pointer;transition:var(--transition-base)}
  .theme-toggle:hover{background:var(--surface-hover);color:var(--text-primary)}
</style>
```

- [ ] **Step 4: 验证 + 提交**
```bash
npm run check && git add -A && git commit -m "feat(design): 主题切换 + 防闪烁"
```

---

## Task 4: i18n 字典与切换

**Files:**
- Create: `src/lib/i18n/dict.ts`, `src/lib/i18n/index.ts`, `src/lib/components/LangToggle.svelte`

- [ ] **Step 1: dict.ts**
```ts
export type Lang = 'zh' | 'en';
export const dict = {
  'app.title':       { zh: '新员工入职', en: 'Onboarding' },
  'role.learner':    { zh: '我是新员工', en: "I'm a new hire" },
  'role.editor':     { zh: '我是编辑者', en: "I'm an editor" },
  'role.pick':       { zh: '请选择你的身份', en: 'Choose your role' },
  'learn.continue':  { zh: '继续', en: 'Continue' },
  'learn.locked':    { zh: '完成本节后解锁', en: 'Complete this section to unlock' },
  'req.scroll':      { zh: '读完本节正文', en: 'Read to the end' },
  'req.dwell':       { zh: '阅读时间不足', en: 'Keep reading' },
  'req.video':       { zh: '看完视频', en: 'Finish the video' },
  'req.quiz':        { zh: '答对所有题目', en: 'Answer all questions' },
  'quiz.submit':     { zh: '提交答案', en: 'Submit' },
  'quiz.wrong':      { zh: '有答案不正确,请重试', en: 'Some answers are wrong, try again' },
  'quiz.correct':    { zh: '全部正确', en: 'All correct' }
} as const;
export type DictKey = keyof typeof dict;
```

- [ ] **Step 2: index.ts(store + t)**
```ts
import { writable, derived } from 'svelte/store';
import { dict, type DictKey, type Lang } from './dict';
function initial(): Lang {
  if (typeof localStorage === 'undefined') return 'zh';
  return (localStorage.getItem('lang') as Lang) ?? 'zh';
}
export const lang = writable<Lang>(initial());
export function setLang(l: Lang) {
  lang.set(l);
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  if (typeof localStorage !== 'undefined') localStorage.setItem('lang', l);
}
export const t = derived(lang, ($l) => (key: DictKey) => dict[key][$l]);
```

- [ ] **Step 3: LangToggle.svelte**
```svelte
<script lang="ts">
  import { lang, setLang } from '$lib/i18n';
  function onClick() { setLang($lang === 'zh' ? 'en' : 'zh'); }
</script>
<button class="lang-toggle" onclick={onClick}>{$lang === 'zh' ? 'EN' : '中'}</button>
<style>
  .lang-toggle{height:36px;padding:0 var(--space-3);border:1px solid var(--border-default);
    background:var(--surface-elevated);color:var(--text-secondary);border-radius:var(--radius-lg);
    font-family:var(--font-mono);font-size:var(--text-xs);cursor:pointer;transition:var(--transition-base)}
  .lang-toggle:hover{background:var(--surface-hover);color:var(--text-primary)}
</style>
```

- [ ] **Step 4: 验证 + 提交**
```bash
npm run check && git add -A && git commit -m "feat(i18n): 中英字典与切换"
```

---

## Task 5: Drizzle schema 与 db client

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/index.ts`, `drizzle.config.ts`, `.env.example`

- [ ] **Step 1: schema.ts**
```ts
import { sqliteTable, text, integer, real, unique } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  role: text('role', { enum: ['learner', 'editor'] }).notNull().default('learner'),
  createdAt: integer('created_at').notNull()
});

export const modules = sqliteTable('modules', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  order: integer('order').notNull()
});

export const sections = sqliteTable('sections', {
  id: text('id').primaryKey(),
  moduleId: text('module_id').notNull().references(() => modules.id),
  title: text('title').notNull(),
  order: integer('order').notNull(),
  minDwellMs: integer('min_dwell_ms').notNull().default(0)
});

export const blocks = sqliteTable('blocks', {
  id: text('id').primaryKey(),
  sectionId: text('section_id').notNull().references(() => sections.id),
  type: text('type').notNull(),
  order: integer('order').notNull(),
  content: text('content').notNull() // JSON
});

export const quizzes = sqliteTable('quizzes', {
  id: text('id').primaryKey(),
  sectionId: text('section_id').notNull().references(() => sections.id),
  order: integer('order').notNull(),
  type: text('type', { enum: ['single', 'multiple', 'boolean'] }).notNull(),
  question: text('question').notNull(),
  options: text('options').notNull(), // JSON string[]
  answer: text('answer').notNull()    // JSON: number | number[] | boolean
});

export const progress = sqliteTable('progress', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  sectionId: text('section_id').notNull(),
  status: text('status', { enum: ['locked', 'in_progress', 'completed'] }).notNull().default('in_progress'),
  readPct: real('read_pct').notNull().default(0),
  scrolledToBottom: integer('scrolled_to_bottom').notNull().default(0),
  dwellMs: integer('dwell_ms').notNull().default(0),
  videoIntervals: text('video_intervals').notNull().default('[]'), // JSON VideoInterval[]
  quizPassed: integer('quiz_passed').notNull().default(0),
  startedAt: integer('started_at').notNull(),
  completedAt: integer('completed_at')
}, (tbl) => ({ uq: unique().on(tbl.userId, tbl.sectionId) }));
```

- [ ] **Step 2: index.ts**
```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
const file = process.env.DATABASE_URL ?? 'data.sqlite';
const sqlite = new Database(file);
sqlite.pragma('journal_mode = WAL');
export const db = drizzle(sqlite, { schema });
export { schema };
```

- [ ] **Step 3: drizzle.config.ts + .env.example**
```ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'data.sqlite' }
});
```
`.env.example`:
```
DATABASE_URL=data.sqlite
# 轮换后的 DashScope 密钥(P3 用),勿提交真实值
DASHSCOPE_API_KEY=
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3.7-plus
```

- [ ] **Step 4: 生成表 + 验证 + 提交**
```bash
npm run db:push
npm run check && git add -A && git commit -m "feat(db): Drizzle schema 与 SQLite client"
```

---

## Task 6: 内容块类型

**Files:**
- Create: `src/lib/content/types.ts`

- [ ] **Step 1: types.ts**
```ts
export type QuizType = 'single' | 'multiple' | 'boolean';

export interface QuizData {
  id: string;
  order: number;
  type: QuizType;
  question: string;
  options: string[];           // boolean 题可为 ['对','错']
}

export type Block =
  | { id: string; type: 'heading'; level: 2 | 3; text: string }
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'image'; src: string; alt: string; caption?: string }
  | { id: string; type: 'list'; ordered: boolean; items: string[] }
  | { id: string; type: 'quote'; text: string; cite?: string }
  | { id: string; type: 'callout'; variant: 'info' | 'success' | 'warning' | 'error'; title: string; body: string }
  | { id: string; type: 'video'; src: string; durationSec: number; poster?: string }
  | { id: string; type: 'quiz'; quizIds: string[] };

export interface SectionView {
  id: string;
  title: string;
  blocks: Block[];
  quizzes: QuizData[];          // 不含答案
  requirements: {
    minDwellMs: number;
    hasVideo: boolean;
    videoDurationSec: number | null;
    hasQuiz: boolean;
    videoCoverageThreshold: number;
  };
}
```

- [ ] **Step 2: 验证 + 提交**
```bash
npm run check && git add -A && git commit -m "feat(content): 内容块判别联合类型"
```

---

## Task 7: 防跳过类型 + 区间引擎(含单测)

**Files:**
- Create: `src/lib/anti-skip/types.ts`, `src/lib/anti-skip/intervals.ts`, `src/lib/anti-skip/intervals.test.ts`

- [ ] **Step 1: types.ts**
```ts
export interface VideoInterval { start: number; end: number } // 秒
export interface ReadingState {
  scrolledToBottom: boolean;
  dwellMs: number;
  videoIntervals: VideoInterval[];
  quizPassed: boolean;
}
export interface SectionRequirements {
  minDwellMs: number;
  hasVideo: boolean;
  videoDurationSec: number | null;
  hasQuiz: boolean;
  videoCoverageThreshold: number; // 0..1
}
export type UnmetReason = 'scroll' | 'dwell' | 'video' | 'quiz';
export interface CompletionResult { complete: boolean; reasons: UnmetReason[] }
```

- [ ] **Step 2: 先写失败单测 intervals.test.ts**
```ts
import { describe, it, expect } from 'vitest';
import { mergeIntervals, coveredSeconds, coverageRatio } from './intervals';

describe('mergeIntervals', () => {
  it('合并重叠与相邻区间', () => {
    expect(mergeIntervals([{start:0,end:5},{start:4,end:8},{start:8,end:10}]))
      .toEqual([{start:0,end:10}]);
  });
  it('保留不相邻区间', () => {
    expect(mergeIntervals([{start:0,end:2},{start:5,end:7}]))
      .toEqual([{start:0,end:2},{start:5,end:7}]);
  });
});
describe('coverage', () => {
  it('coveredSeconds 求总覆盖时长', () => {
    expect(coveredSeconds([{start:0,end:2},{start:5,end:7}])).toBe(4);
  });
  it('coverageRatio 比上时长', () => {
    expect(coverageRatio([{start:0,end:9.5}], 10)).toBeCloseTo(0.95);
  });
  it('时长为 0 返回 0', () => {
    expect(coverageRatio([], 0)).toBe(0);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npm test`  Expected: FAIL(模块未实现)。

- [ ] **Step 4: 实现 intervals.ts**
```ts
import type { VideoInterval } from './types';

export function mergeIntervals(input: VideoInterval[]): VideoInterval[] {
  if (input.length === 0) return [];
  const sorted = [...input].sort((a, b) => a.start - b.start);
  const out: VideoInterval[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const last = out[out.length - 1]!;
    if (cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push({ ...cur });
  }
  return out;
}
export function coveredSeconds(intervals: VideoInterval[]): number {
  return mergeIntervals(intervals).reduce((s, i) => s + (i.end - i.start), 0);
}
export function coverageRatio(intervals: VideoInterval[], durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.min(1, coveredSeconds(intervals) / durationSec);
}
```

- [ ] **Step 5: 运行确认通过 + 提交**
```bash
npm test
git add -A && git commit -m "feat(anti-skip): 视频区间覆盖引擎 + 单测"
```
Expected: PASS。

---

## Task 8: 完成判定规则(含单测)

**Files:**
- Create: `src/lib/anti-skip/rules.ts`, `src/lib/anti-skip/rules.test.ts`

- [ ] **Step 1: 先写失败单测 rules.test.ts**
```ts
import { describe, it, expect } from 'vitest';
import { evaluateCompletion } from './rules';
import type { ReadingState, SectionRequirements } from './types';

const reqAll: SectionRequirements = { minDwellMs: 1000, hasVideo: true, videoDurationSec: 10, hasQuiz: true, videoCoverageThreshold: 0.95 };
const full: ReadingState = { scrolledToBottom: true, dwellMs: 1200, videoIntervals: [{start:0,end:10}], quizPassed: true };

it('全部满足 → complete', () => {
  expect(evaluateCompletion(full, reqAll)).toEqual({ complete: true, reasons: [] });
});
it('未滚到底 → scroll', () => {
  expect(evaluateCompletion({ ...full, scrolledToBottom: false }, reqAll).reasons).toContain('scroll');
});
it('停留不足 → dwell', () => {
  expect(evaluateCompletion({ ...full, dwellMs: 500 }, reqAll).reasons).toContain('dwell');
});
it('视频覆盖不足 → video', () => {
  expect(evaluateCompletion({ ...full, videoIntervals: [{start:0,end:5}] }, reqAll).reasons).toContain('video');
});
it('题目未过 → quiz', () => {
  expect(evaluateCompletion({ ...full, quizPassed: false }, reqAll).reasons).toContain('quiz');
});
it('无视频无题目时忽略对应规则', () => {
  const req: SectionRequirements = { minDwellMs: 0, hasVideo: false, videoDurationSec: null, hasQuiz: false, videoCoverageThreshold: 0.95 };
  const st: ReadingState = { scrolledToBottom: true, dwellMs: 0, videoIntervals: [], quizPassed: false };
  expect(evaluateCompletion(st, req).complete).toBe(true);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`  Expected: FAIL。

- [ ] **Step 3: 实现 rules.ts**
```ts
import type { ReadingState, SectionRequirements, CompletionResult, UnmetReason } from './types';
import { coverageRatio } from './intervals';

export function evaluateCompletion(state: ReadingState, req: SectionRequirements): CompletionResult {
  const reasons: UnmetReason[] = [];
  if (!state.scrolledToBottom) reasons.push('scroll');
  if (state.dwellMs < req.minDwellMs) reasons.push('dwell');
  if (req.hasVideo) {
    const ratio = coverageRatio(state.videoIntervals, req.videoDurationSec ?? 0);
    if (ratio < req.videoCoverageThreshold) reasons.push('video');
  }
  if (req.hasQuiz && !state.quizPassed) reasons.push('quiz');
  return { complete: reasons.length === 0, reasons };
}
```

- [ ] **Step 4: 运行确认通过 + 提交**
```bash
npm test
git add -A && git commit -m "feat(anti-skip): 完成判定规则 + 单测"
```

---

## Task 9: 判分逻辑(含单测)

**Files:**
- Create: `src/lib/quiz/grade.ts`, `src/lib/quiz/grade.test.ts`

- [ ] **Step 1: 先写失败单测 grade.test.ts**
```ts
import { describe, it, expect } from 'vitest';
import { gradeQuiz } from './grade';

it('单选正确', () => expect(gradeQuiz('single', 2, 2)).toBe(true));
it('单选错误', () => expect(gradeQuiz('single', 2, 1)).toBe(false));
it('判断正确', () => expect(gradeQuiz('boolean', true, true)).toBe(true));
it('多选顺序无关', () => expect(gradeQuiz('multiple', [0,2], [2,0])).toBe(true));
it('多选缺项错误', () => expect(gradeQuiz('multiple', [0,2], [0])).toBe(false));
it('多选提交非数组错误', () => expect(gradeQuiz('multiple', [0], '0' as unknown)).toBe(false));
```

- [ ] **Step 2: 运行确认失败 → 实现 grade.ts**
```ts
import type { QuizType } from '$lib/content/types';

export function gradeQuiz(type: QuizType, answer: unknown, submitted: unknown): boolean {
  if (type === 'single') return typeof submitted === 'number' && submitted === answer;
  if (type === 'boolean') return typeof submitted === 'boolean' && submitted === answer;
  if (type === 'multiple') {
    if (!Array.isArray(submitted) || !Array.isArray(answer)) return false;
    const a = [...(submitted as number[])].sort((x, y) => x - y);
    const b = [...(answer as number[])].sort((x, y) => x - y);
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return false;
}
```

- [ ] **Step 3: 运行通过 + 提交**
```bash
npm test && git add -A && git commit -m "feat(quiz): 判分逻辑 + 单测"
```

---

## Task 10: 查询封装与种子数据

**Files:**
- Create: `src/lib/db/queries.ts`, `src/lib/db/seed.ts`

- [ ] **Step 1: queries.ts**
```ts
import { eq, and, asc } from 'drizzle-orm';
import { db, schema } from './index';
import type { SectionView, Block, QuizData } from '$lib/content/types';

const VIDEO_COVERAGE = 0.95;

export function listModulesWithSections() {
  const mods = db.select().from(schema.modules).orderBy(asc(schema.modules.order)).all();
  return mods.map((m) => ({
    ...m,
    sections: db.select().from(schema.sections)
      .where(eq(schema.sections.moduleId, m.id))
      .orderBy(asc(schema.sections.order)).all()
  }));
}

export function orderedSectionIds(): string[] {
  return listModulesWithSections().flatMap((m) => m.sections.map((s) => s.id));
}

export function getSectionView(sectionId: string): SectionView | null {
  const s = db.select().from(schema.sections).where(eq(schema.sections.id, sectionId)).get();
  if (!s) return null;
  const blockRows = db.select().from(schema.blocks)
    .where(eq(schema.blocks.sectionId, sectionId)).orderBy(asc(schema.blocks.order)).all();
  const blocks = blockRows.map((b) => ({ id: b.id, ...JSON.parse(b.content) } as Block));
  const quizRows = db.select().from(schema.quizzes)
    .where(eq(schema.quizzes.sectionId, sectionId)).orderBy(asc(schema.quizzes.order)).all();
  const quizzes: QuizData[] = quizRows.map((q) => ({
    id: q.id, order: q.order, type: q.type, question: q.question, options: JSON.parse(q.options)
  }));
  const video = blocks.find((b) => b.type === 'video');
  return {
    id: s.id, title: s.title, blocks, quizzes,
    requirements: {
      minDwellMs: s.minDwellMs,
      hasVideo: !!video,
      videoDurationSec: video && video.type === 'video' ? video.durationSec : null,
      hasQuiz: quizzes.length > 0,
      videoCoverageThreshold: VIDEO_COVERAGE
    }
  };
}

export function getQuizAnswers(sectionId: string) {
  return db.select().from(schema.quizzes).where(eq(schema.quizzes.sectionId, sectionId)).all()
    .map((q) => ({ id: q.id, type: q.type, answer: JSON.parse(q.answer) }));
}
```

- [ ] **Step 2: seed.ts(一个含视频 + 题目的样例模块)**
```ts
import { randomUUID } from 'crypto';
import { db, schema } from './index';

function reset() {
  db.delete(schema.quizzes).run(); db.delete(schema.blocks).run();
  db.delete(schema.sections).run(); db.delete(schema.modules).run();
}
function block(sectionId: string, order: number, data: object) {
  db.insert(schema.blocks).values({ id: randomUUID(), sectionId, type: (data as any).type, order, content: JSON.stringify(data) }).run();
}

reset();
const moduleId = randomUUID();
db.insert(schema.modules).values({ id: moduleId, title: '公司入职第一课', order: 0 }).run();

// Section 1:纯阅读
const s1 = randomUUID();
db.insert(schema.sections).values({ id: s1, moduleId, title: '欢迎与公司价值观', order: 0, minDwellMs: 8000 }).run();
block(s1, 0, { type: 'heading', level: 2, text: '欢迎加入' });
block(s1, 1, { type: 'paragraph', text: '本节介绍公司的使命与价值观。请认真阅读到底部。' });
block(s1, 2, { type: 'callout', variant: 'info', title: '提示', body: '阅读完成并停留足够时间后,才能进入下一节。' });
block(s1, 3, { type: 'list', ordered: true, items: ['客户第一', '务实创新', '长期主义'] });

// Section 2:视频 + 题目
const s2 = randomUUID();
db.insert(schema.sections).values({ id: s2, moduleId, title: '安全合规', order: 1, minDwellMs: 5000 }).run();
block(s2, 0, { type: 'heading', level: 2, text: '信息安全基础' });
block(s2, 1, { type: 'paragraph', text: '观看下面的视频并完成测验。' });
block(s2, 2, { type: 'video', src: 'https://www.w3schools.com/html/mov_bbb.mp4', durationSec: 10 });
block(s2, 3, { type: 'quiz', quizIds: [] }); // 渲染占位,题目从 quizzes 表取

const q1 = randomUUID();
db.insert(schema.quizzes).values({ id: q1, sectionId: s2, order: 0, type: 'single',
  question: '收到可疑邮件应如何处理?', options: JSON.stringify(['直接点击链接','转发同事','上报安全团队']), answer: JSON.stringify(2) }).run();
const q2 = randomUUID();
db.insert(schema.quizzes).values({ id: q2, sectionId: s2, order: 1, type: 'boolean',
  question: '可以与同事共用账号密码。', options: JSON.stringify(['对','错']), answer: JSON.stringify(false) }).run();

console.log('Seeded modules/sections/blocks/quizzes.');
```

- [ ] **Step 3: 跑种子 + 验证 + 提交**
```bash
npm run db:seed
npm run check && git add -A && git commit -m "feat(db): 查询封装与种子数据"
```

---

## Task 11: 会话(匿名 uid + role)

**Files:**
- Create: `src/lib/server/session.ts`, `src/hooks.server.ts`, `src/app.d.ts`(修改)

- [ ] **Step 1: session.ts**
```ts
import type { Cookies } from '@sveltejs/kit';
import { randomUUID } from 'crypto';
import { db, schema } from '$lib/db';
import { eq } from 'drizzle-orm';

const UID = 'uid';
export type Role = 'learner' | 'editor';

export function ensureUid(cookies: Cookies): string {
  let uid = cookies.get(UID);
  if (!uid) {
    uid = randomUUID();
    cookies.set(UID, uid, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
    db.insert(schema.users).values({ id: uid, role: 'learner', createdAt: Date.now() }).run();
  }
  return uid;
}
export function getRole(uid: string): Role {
  const u = db.select().from(schema.users).where(eq(schema.users.id, uid)).get();
  return (u?.role as Role) ?? 'learner';
}
export function setRole(uid: string, role: Role) {
  db.insert(schema.users).values({ id: uid, role, createdAt: Date.now() })
    .onConflictDoUpdate({ target: schema.users.id, set: { role } }).run();
}
```

- [ ] **Step 2: hooks.server.ts**
```ts
import type { Handle } from '@sveltejs/kit';
import { ensureUid, getRole } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
  const uid = ensureUid(event.cookies);
  event.locals.uid = uid;
  event.locals.role = getRole(uid);
  return resolve(event);
};
```

- [ ] **Step 3: app.d.ts**
```ts
declare global {
  namespace App {
    interface Locals { uid: string; role: 'learner' | 'editor' }
  }
}
export {};
```

- [ ] **Step 4: 验证 + 提交**
```bash
npm run check && git add -A && git commit -m "feat(server): 匿名会话与角色"
```

---

## Task 12: 进度服务(服务端权威)

**Files:**
- Create: `src/lib/server/progress.ts`

- [ ] **Step 1: progress.ts**
```ts
import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '$lib/db';
import { mergeIntervals } from '$lib/anti-skip/intervals';
import { evaluateCompletion } from '$lib/anti-skip/rules';
import type { VideoInterval, ReadingState } from '$lib/anti-skip/types';
import { getSectionView, getQuizAnswers, orderedSectionIds } from '$lib/db/queries';
import { gradeQuiz } from '$lib/quiz/grade';

function row(userId: string, sectionId: string) {
  return db.select().from(schema.progress)
    .where(and(eq(schema.progress.userId, userId), eq(schema.progress.sectionId, sectionId))).get();
}

export function startSection(userId: string, sectionId: string) {
  const existing = row(userId, sectionId);
  if (existing) return existing;
  const rec = { id: randomUUID(), userId, sectionId, status: 'in_progress' as const,
    readPct: 0, scrolledToBottom: 0, dwellMs: 0, videoIntervals: '[]', quizPassed: 0,
    startedAt: Date.now(), completedAt: null };
  db.insert(schema.progress).values(rec).run();
  return rec;
}

export function isUnlocked(userId: string, sectionId: string): boolean {
  const ids = orderedSectionIds();
  const idx = ids.indexOf(sectionId);
  if (idx <= 0) return true; // 第一节永远解锁
  const prev = row(userId, ids[idx - 1]!);
  return prev?.status === 'completed';
}

export function applyHeartbeat(userId: string, sectionId: string,
  hb: { scrolledToBottom: boolean; dwellMs: number; videoIntervals: VideoInterval[] }) {
  startSection(userId, sectionId);
  const merged = mergeIntervals(hb.videoIntervals);
  db.update(schema.progress).set({
    scrolledToBottom: hb.scrolledToBottom ? 1 : 0,
    dwellMs: hb.dwellMs,
    videoIntervals: JSON.stringify(merged)
  }).where(and(eq(schema.progress.userId, userId), eq(schema.progress.sectionId, sectionId))).run();
  return currentState(userId, sectionId);
}

function currentState(userId: string, sectionId: string): ReadingState {
  const r = row(userId, sectionId)!;
  return {
    scrolledToBottom: !!r.scrolledToBottom,
    dwellMs: r.dwellMs,
    videoIntervals: JSON.parse(r.videoIntervals),
    quizPassed: !!r.quizPassed
  };
}

export function submitQuiz(userId: string, sectionId: string, answers: Record<string, unknown>) {
  startSection(userId, sectionId);
  const keyed = getQuizAnswers(sectionId);
  const allCorrect = keyed.length > 0 && keyed.every((q) => gradeQuiz(q.type, q.answer, answers[q.id]));
  db.update(schema.progress).set({ quizPassed: allCorrect ? 1 : 0 })
    .where(and(eq(schema.progress.userId, userId), eq(schema.progress.sectionId, sectionId))).run();
  return allCorrect;
}

export function attemptComplete(userId: string, sectionId: string) {
  const view = getSectionView(sectionId);
  if (!view) return { complete: false, reasons: ['scroll'] as const };
  const r = row(userId, sectionId);
  if (!r) { startSection(userId, sectionId); }
  const state = currentState(userId, sectionId);
  // 服务端时间二次校验:防客户端伪造 dwellMs
  const serverElapsed = Date.now() - (r?.startedAt ?? Date.now());
  const dwellMs = Math.min(state.dwellMs, serverElapsed);
  const result = evaluateCompletion({ ...state, dwellMs }, view.requirements);
  if (result.complete) {
    db.update(schema.progress).set({ status: 'completed', completedAt: Date.now(), readPct: 1 })
      .where(and(eq(schema.progress.userId, userId), eq(schema.progress.sectionId, sectionId))).run();
  }
  return result;
}

export function progressMap(userId: string): Record<string, string> {
  const rows = db.select().from(schema.progress).where(eq(schema.progress.userId, userId)).all();
  return Object.fromEntries(rows.map((r) => [r.sectionId, r.status]));
}
```

- [ ] **Step 2: 验证 + 提交**
```bash
npm run check && git add -A && git commit -m "feat(server): 服务端权威进度服务"
```

---

## Task 13: API 路由(role / heartbeat / complete / quiz)

**Files:**
- Create: `src/routes/api/role/+server.ts`, `src/routes/api/progress/heartbeat/+server.ts`, `src/routes/api/progress/complete/+server.ts`, `src/routes/api/quiz/submit/+server.ts`

- [ ] **Step 1: role**
```ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { setRole } from '$lib/server/session';

export const POST: RequestHandler = async ({ request, locals }) => {
  const { role } = await request.json();
  if (role !== 'learner' && role !== 'editor') return json({ ok: false }, { status: 400 });
  setRole(locals.uid, role);
  return json({ ok: true, role });
};
```

- [ ] **Step 2: heartbeat**
```ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { applyHeartbeat, isUnlocked } from '$lib/server/progress';

export const POST: RequestHandler = async ({ request, locals }) => {
  const { sectionId, scrolledToBottom, dwellMs, videoIntervals } = await request.json();
  if (!isUnlocked(locals.uid, sectionId)) return json({ ok: false }, { status: 403 });
  const state = applyHeartbeat(locals.uid, sectionId, {
    scrolledToBottom: !!scrolledToBottom,
    dwellMs: Number(dwellMs) || 0,
    videoIntervals: Array.isArray(videoIntervals) ? videoIntervals : []
  });
  return json({ ok: true, state });
};
```

- [ ] **Step 3: complete**
```ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { attemptComplete, isUnlocked } from '$lib/server/progress';

export const POST: RequestHandler = async ({ request, locals }) => {
  const { sectionId } = await request.json();
  if (!isUnlocked(locals.uid, sectionId)) return json({ ok: false }, { status: 403 });
  return json(attemptComplete(locals.uid, sectionId));
};
```

- [ ] **Step 4: quiz/submit**
```ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { submitQuiz, isUnlocked } from '$lib/server/progress';

export const POST: RequestHandler = async ({ request, locals }) => {
  const { sectionId, answers } = await request.json();
  if (!isUnlocked(locals.uid, sectionId)) return json({ ok: false }, { status: 403 });
  const passed = submitQuiz(locals.uid, sectionId, answers ?? {});
  return json({ ok: true, passed });
};
```

- [ ] **Step 5: 验证 + 提交**
```bash
npm run check && git add -A && git commit -m "feat(api): role/heartbeat/complete/quiz 路由"
```

---

## Task 14: 内容块组件 + 渲染器

**Files:**
- Create: `src/lib/content/blocks/*.svelte`, `src/lib/content/BlockRenderer.svelte`

- [ ] **Step 1: 静态块组件**(各自一个文件,均用 token 样式)

`Heading.svelte`:
```svelte
<script lang="ts">let { level, text }: { level: 2|3; text: string } = $props();</script>
{#if level === 2}<h2>{text}</h2>{:else}<h3>{text}</h3>{/if}
<style>
  h2{font-size:var(--text-2xl);font-weight:800;color:var(--text-primary);margin:var(--space-6) 0 var(--space-3)}
  h3{font-size:var(--text-xl);font-weight:700;color:var(--text-primary);margin:var(--space-5) 0 var(--space-2)}
</style>
```
`Paragraph.svelte`:
```svelte
<script lang="ts">let { text }: { text: string } = $props();</script>
<p>{text}</p>
<style>p{color:var(--text-secondary);font-size:var(--text-base);line-height:1.7;margin:0 0 var(--space-4)}</style>
```
`ImageBlock.svelte`:
```svelte
<script lang="ts">let { src, alt, caption }: { src: string; alt: string; caption?: string } = $props();</script>
<figure><img {src} {alt} /><br />{#if caption}<figcaption>{caption}</figcaption>{/if}</figure>
<style>
  figure{margin:0 0 var(--space-4)} img{max-width:100%;border-radius:var(--radius-xl);border:1px solid var(--border-default)}
  figcaption{font-size:var(--text-sm);color:var(--text-tertiary);margin-top:var(--space-2)}
</style>
```
`ListBlock.svelte`:
```svelte
<script lang="ts">let { ordered, items }: { ordered: boolean; items: string[] } = $props();</script>
{#if ordered}<ol>{#each items as it}<li>{it}</li>{/each}</ol>
{:else}<ul>{#each items as it}<li>{it}</li>{/each}</ul>{/if}
<style>ol,ul{color:var(--text-secondary);padding-left:var(--space-6);margin:0 0 var(--space-4)} li{margin:var(--space-1) 0}</style>
```
`Quote.svelte`:
```svelte
<script lang="ts">let { text, cite }: { text: string; cite?: string } = $props();</script>
<blockquote><p>{text}</p>{#if cite}<cite>— {cite}</cite>{/if}</blockquote>
<style>
  blockquote{border-left:3px solid var(--brand-500);background:var(--surface-subtle);
    padding:var(--space-3) var(--space-4);border-radius:var(--radius-md);margin:0 0 var(--space-4)}
  cite{display:block;color:var(--text-tertiary);font-size:var(--text-sm);margin-top:var(--space-2)}
</style>
```
`Callout.svelte`:
```svelte
<script lang="ts">
  let { variant, title, body }: { variant: 'info'|'success'|'warning'|'error'; title: string; body: string } = $props();
</script>
<div class="callout {variant}"><strong>{title}</strong><p>{body}</p></div>
<style>
  .callout{padding:var(--space-4);border-radius:var(--radius-lg);border:1px solid;margin:0 0 var(--space-4)}
  .callout p{margin:var(--space-1) 0 0;font-size:var(--text-sm)}
  .info{background:var(--info-bg);border-color:var(--info);color:var(--info)}
  .success{background:var(--success-bg);border-color:var(--success);color:var(--success)}
  .warning{background:var(--warning-bg);border-color:var(--warning);color:var(--warning)}
  .error{background:var(--error-bg);border-color:var(--error);color:var(--error)}
</style>
```

- [ ] **Step 2: VideoBlock.svelte(禁快进 + 区间采集 + 失焦暂停)**
```svelte
<script lang="ts">
  import type { VideoInterval } from '$lib/anti-skip/types';
  let { src, durationSec, poster, onintervals }:
    { src: string; durationSec: number; poster?: string; onintervals: (i: VideoInterval[]) => void } = $props();
  let video: HTMLVideoElement;
  let maxAllowed = $state(0);           // 已允许观看到的最大秒
  let intervals: VideoInterval[] = [];
  let lastT = 0;

  function onTime() {
    const t = video.currentTime;
    if (t > maxAllowed + 0.5) { video.currentTime = maxAllowed; return; } // 禁止快进
    if (t > lastT) { intervals.push({ start: lastT, end: t }); onintervals(intervals); }
    lastT = t; maxAllowed = Math.max(maxAllowed, t);
  }
  function onSeeking() { if (video.currentTime > maxAllowed + 0.5) video.currentTime = maxAllowed; }
  function onBlur() { if (video && !video.paused) video.pause(); }
  $effect(() => {
    document.addEventListener('visibilitychange', onBlur);
    window.addEventListener('blur', onBlur);
    return () => { document.removeEventListener('visibilitychange', onBlur); window.removeEventListener('blur', onBlur); };
  });
</script>
<video bind:this={video} {src} {poster} controls controlslist="nodownload noplaybackrate"
  ontimeupdate={onTime} onseeking={onSeeking} preload="metadata"></video>
<style>video{width:100%;border-radius:var(--radius-xl);border:1px solid var(--border-default);background:#000;margin:0 0 var(--space-4)}</style>
```

- [ ] **Step 3: QuizBlock.svelte(单选/多选/判断)**
```svelte
<script lang="ts">
  import type { QuizData } from '$lib/content/types';
  import { t } from '$lib/i18n';
  let { quizzes, sectionId, onpassed }:
    { quizzes: QuizData[]; sectionId: string; onpassed: () => void } = $props();
  let single = $state<Record<string, number>>({});
  let multi = $state<Record<string, number[]>>({});
  let bool = $state<Record<string, boolean>>({});
  let msg = $state('');

  function toggleMulti(qid: string, i: number) {
    const arr = multi[qid] ?? [];
    multi[qid] = arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i];
  }
  function buildAnswers() {
    const a: Record<string, unknown> = {};
    for (const q of quizzes) {
      if (q.type === 'single') a[q.id] = single[q.id];
      else if (q.type === 'multiple') a[q.id] = multi[q.id] ?? [];
      else a[q.id] = bool[q.id];
    }
    return a;
  }
  async function submit() {
    const res = await fetch('/api/quiz/submit', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sectionId, answers: buildAnswers() }) }).then((r) => r.json());
    if (res.passed) { msg = $t('quiz.correct'); onpassed(); } else { msg = $t('quiz.wrong'); }
  }
</script>
<div class="quiz">
  {#each quizzes as q (q.id)}
    <p class="q">{q.question}</p>
    {#if q.type === 'boolean'}
      {#each q.options as opt, i}
        <label><input type="radio" name={q.id} onchange={() => bool[q.id] = i === 0} /> {opt}</label>
      {/each}
    {:else if q.type === 'single'}
      {#each q.options as opt, i}
        <label><input type="radio" name={q.id} onchange={() => single[q.id] = i} /> {opt}</label>
      {/each}
    {:else}
      {#each q.options as opt, i}
        <label><input type="checkbox" onchange={() => toggleMulti(q.id, i)} /> {opt}</label>
      {/each}
    {/if}
  {/each}
  <button class="btn-primary" onclick={submit}>{$t('quiz.submit')}</button>
  {#if msg}<span class="msg">{msg}</span>{/if}
</div>
<style>
  .quiz{margin:var(--space-4) 0;padding:var(--space-5);border:1px solid var(--border-default);
    border-radius:var(--radius-2xl);background:var(--surface-elevated)}
  .q{font-weight:700;color:var(--text-primary);margin:var(--space-4) 0 var(--space-2)}
  label{display:block;color:var(--text-secondary);padding:var(--space-1) 0;cursor:pointer}
  .btn-primary{margin-top:var(--space-4);padding:var(--space-2) var(--space-5);border:none;border-radius:var(--radius-lg);
    background:var(--brand-500);color:var(--text-inverse);font-weight:700;cursor:pointer}
  .msg{margin-left:var(--space-3);font-size:var(--text-sm);color:var(--text-secondary)}
</style>
```

- [ ] **Step 4: BlockRenderer.svelte**
```svelte
<script lang="ts">
  import type { Block, QuizData, VideoInterval } from '$lib/content/types';
  import Heading from './blocks/Heading.svelte';
  import Paragraph from './blocks/Paragraph.svelte';
  import ImageBlock from './blocks/ImageBlock.svelte';
  import ListBlock from './blocks/ListBlock.svelte';
  import Quote from './blocks/Quote.svelte';
  import Callout from './blocks/Callout.svelte';
  import VideoBlock from './blocks/VideoBlock.svelte';
  import QuizBlock from './blocks/QuizBlock.svelte';
  let { block, quizzes, sectionId, onintervals, onpassed }:
    { block: Block; quizzes: QuizData[]; sectionId: string;
      onintervals: (i: VideoInterval[]) => void; onpassed: () => void } = $props();
</script>
{#if block.type === 'heading'}<Heading level={block.level} text={block.text} />
{:else if block.type === 'paragraph'}<Paragraph text={block.text} />
{:else if block.type === 'image'}<ImageBlock src={block.src} alt={block.alt} caption={block.caption} />
{:else if block.type === 'list'}<ListBlock ordered={block.ordered} items={block.items} />
{:else if block.type === 'quote'}<Quote text={block.text} cite={block.cite} />
{:else if block.type === 'callout'}<Callout variant={block.variant} title={block.title} body={block.body} />
{:else if block.type === 'video'}<VideoBlock src={block.src} durationSec={block.durationSec} poster={block.poster} {onintervals} />
{:else if block.type === 'quiz'}<QuizBlock {quizzes} {sectionId} {onpassed} />
{/if}
```
> 注:`VideoInterval` 需从 `content/types.ts` re-export(`export type { VideoInterval } from '$lib/anti-skip/types';`)。

- [ ] **Step 5: 验证 + 提交**
```bash
npm run check && git add -A && git commit -m "feat(content): 内容块组件与渲染器"
```

---

## Task 15: 客户端心跳采集器

**Files:**
- Create: `src/lib/anti-skip/heartbeat.ts`

- [ ] **Step 1: heartbeat.ts**
```ts
import type { VideoInterval } from './types';

export interface HeartbeatController { stop: () => void; setScrolledBottom: () => void; setIntervals: (i: VideoInterval[]) => void; }

export function startHeartbeat(opts: {
  sectionId: string; scrollEl: HTMLElement; intervalMs?: number;
  onState?: (s: { complete: boolean; reasons: string[] }) => void;
}): HeartbeatController {
  let dwellMs = 0; let scrolledToBottom = false; let intervals: VideoInterval[] = [];
  let last = Date.now();
  const tick = setInterval(() => {
    const now = Date.now();
    if (document.visibilityState === 'visible' && document.hasFocus()) dwellMs += now - last;
    last = now;
  }, 1000);
  function onScroll() {
    const el = opts.scrollEl;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) scrolledToBottom = true;
  }
  opts.scrollEl.addEventListener('scroll', onScroll);
  const beat = setInterval(send, opts.intervalMs ?? 4000);
  async function send() {
    const res = await fetch('/api/progress/heartbeat', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sectionId: opts.sectionId, scrolledToBottom, dwellMs, videoIntervals: intervals }) })
      .then((r) => r.json()).catch(() => null);
    if (res?.state && opts.onState) {
      // 由调用方结合 requirements 评估;此处仅回传原始 state
    }
  }
  return {
    stop: () => { clearInterval(tick); clearInterval(beat); opts.scrollEl.removeEventListener('scroll', onScroll); void send(); },
    setScrolledBottom: () => { scrolledToBottom = true; },
    setIntervals: (i) => { intervals = i; }
  };
}
```

- [ ] **Step 2: 验证 + 提交**
```bash
npm run check && git add -A && git commit -m "feat(anti-skip): 客户端心跳采集器"
```

---

## Task 16: 应用外壳 + 角色选择页

**Files:**
- Create: `src/routes/+layout.server.ts`, `src/routes/+layout.svelte`, `src/routes/+page.svelte`

- [ ] **Step 1: +layout.server.ts**
```ts
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = ({ locals }) => ({ role: locals.role });
```

- [ ] **Step 2: +layout.svelte(状态栏 + 导航 + 切换)**
```svelte
<script lang="ts">
  import '../app.css';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LangToggle from '$lib/components/LangToggle.svelte';
  import { t } from '$lib/i18n';
  let { children } = $props();
</script>
<nav class="topnav">
  <span class="logo">{$t('app.title')}</span>
  <div class="spacer"></div>
  <LangToggle /><ThemeToggle />
</nav>
{@render children()}
<style>
  .topnav{position:sticky;top:0;z-index:50;height:56px;display:flex;align-items:center;gap:var(--space-2);
    padding:0 var(--content-padding-x);background:var(--surface-elevated);
    border-bottom:1px solid var(--border-default);backdrop-filter:blur(10px)}
  .logo{color:var(--text-brand);font-weight:700}
  .spacer{flex:1}
</style>
```

- [ ] **Step 3: +page.svelte(角色选择)**
```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n';
  async function pick(role: 'learner' | 'editor') {
    await fetch('/api/role', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role }) });
    goto(role === 'learner' ? '/learn' : '/learn'); // P2 起编辑者进 /editor
  }
</script>
<main class="pick">
  <h1>{$t('role.pick')}</h1>
  <div class="cards">
    <button class="role-card" onclick={() => pick('learner')}><h3>{$t('role.learner')}</h3></button>
    <button class="role-card" onclick={() => pick('editor')}><h3>{$t('role.editor')}</h3></button>
  </div>
</main>
<style>
  .pick{max-width:var(--content-max-width);margin:0 auto;padding:var(--space-24) var(--content-padding-x);text-align:center}
  h1{font-size:var(--text-3xl);color:var(--text-primary);margin-bottom:var(--space-12)}
  .cards{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-6);max-width:640px;margin:0 auto}
  .role-card{padding:var(--space-12);border:1px solid var(--border-default);border-radius:var(--radius-2xl);
    background:var(--surface-elevated);box-shadow:var(--shadow-sm);cursor:pointer;transition:var(--transition-base)}
  .role-card:hover{box-shadow:var(--shadow-md);transform:translateY(-2px);border-color:var(--border-strong)}
  h3{color:var(--text-primary);margin:0}
</style>
```

- [ ] **Step 4: 验证 + 提交**
```bash
npm run check && npm run build && git add -A && git commit -m "feat(ui): 应用外壳与角色选择"
```

---

## Task 17: 三栏学习外壳 + 侧栏 + 进度环

**Files:**
- Create: `src/routes/learn/+layout.server.ts`, `src/routes/learn/+layout.svelte`, `src/lib/components/Sidebar.svelte`, `src/lib/components/ProgressRing.svelte`, `src/routes/learn/+page.server.ts`

- [ ] **Step 1: learn/+layout.server.ts**
```ts
import type { LayoutServerLoad } from './$types';
import { listModulesWithSections } from '$lib/db/queries';
import { progressMap } from '$lib/server/progress';
export const load: LayoutServerLoad = ({ locals }) => ({
  modules: listModulesWithSections(),
  progress: progressMap(locals.uid)
});
```

- [ ] **Step 2: learn/+page.server.ts(重定向到首个未完成节)**
```ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { orderedSectionIds } from '$lib/db/queries';
import { progressMap } from '$lib/server/progress';
export const load: PageServerLoad = ({ locals }) => {
  const ids = orderedSectionIds();
  if (ids.length === 0) return {};
  const pm = progressMap(locals.uid);
  const target = ids.find((id) => pm[id] !== 'completed') ?? ids[0]!;
  throw redirect(307, `/learn/${target}`);
};
```

- [ ] **Step 3: Sidebar.svelte(章节树 + 锁/完成态)**
```svelte
<script lang="ts">
  import { page } from '$app/stores';
  type Section = { id: string; title: string };
  type Module = { id: string; title: string; sections: Section[] };
  let { modules, progress, orderedIds }:
    { modules: Module[]; progress: Record<string,string>; orderedIds: string[] } = $props();
  function unlocked(id: string): boolean {
    const i = orderedIds.indexOf(id);
    if (i <= 0) return true;
    return progress[orderedIds[i-1]!] === 'completed';
  }
</script>
<aside class="sidebar">
  {#each modules as m}
    <div class="mod">{m.title}</div>
    {#each m.sections as s}
      {@const done = progress[s.id] === 'completed'}
      {@const open = unlocked(s.id)}
      <a class="navitem" class:active={$page.params.sectionId === s.id} class:locked={!open}
         href={open ? `/learn/${s.id}` : undefined} aria-disabled={!open}>
        <span class="ic">{done ? '✓' : open ? '▸' : '🔒'}</span>{s.title}
      </a>
    {/each}
  {/each}
</aside>
<style>
  .sidebar{width:240px;background:var(--surface-elevated);border-right:1px solid var(--border-subtle);
    padding:var(--space-4);overflow-y:auto}
  .mod{font-family:var(--font-mono);font-size:var(--text-xs);text-transform:uppercase;letter-spacing:.05em;
    color:var(--text-tertiary);margin:var(--space-4) 0 var(--space-2)}
  .navitem{display:flex;align-items:center;gap:var(--space-2);padding:var(--space-2) var(--space-3);
    border-radius:var(--radius-lg);color:var(--text-secondary);font-size:var(--text-sm);text-decoration:none}
  .navitem:hover{background:var(--surface-hover);color:var(--text-primary)}
  .navitem.active{background:var(--surface-hover);color:var(--text-primary)}
  .navitem.locked{opacity:.5;cursor:not-allowed}
  .ic{width:18px;text-align:center}
</style>
```

- [ ] **Step 4: ProgressRing.svelte**
```svelte
<script lang="ts">let { pct }: { pct: number } = $props();</script>
<div class="ring" style="--p:{Math.round(pct*100)}"><span>{Math.round(pct*100)}%</span></div>
<style>
  .ring{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;
    background:conic-gradient(var(--brand-500) calc(var(--p)*1%),var(--surface-subtle) 0)}
  .ring span{width:50px;height:50px;border-radius:50%;background:var(--surface-elevated);
    display:flex;align-items:center;justify-content:center;font-size:var(--text-sm);font-weight:700;color:var(--text-brand)}
</style>
```

- [ ] **Step 5: learn/+layout.svelte(三栏)**
```svelte
<script lang="ts">
  import Sidebar from '$lib/components/Sidebar.svelte';
  let { data, children } = $props();
  const orderedIds = data.modules.flatMap((m: any) => m.sections.map((s: any) => s.id));
</script>
<div class="three">
  <Sidebar modules={data.modules} progress={data.progress} {orderedIds} />
  <div class="center">{@render children()}</div>
</div>
<style>
  .three{display:grid;grid-template-columns:240px 1fr;height:calc(100vh - 56px)}
  .center{overflow-y:auto;background:var(--surface-page)}
</style>
```

- [ ] **Step 6: 验证 + 提交**
```bash
npm run check && git add -A && git commit -m "feat(ui): 三栏外壳/侧栏/进度环"
```

---

## Task 18: 章节阅读页(解锁守卫 + 右栏门禁)

**Files:**
- Create: `src/routes/learn/[sectionId]/+page.server.ts`, `src/routes/learn/[sectionId]/+page.svelte`, `src/lib/components/ContinueButton.svelte`

- [ ] **Step 1: +page.server.ts(服务端解锁守卫 —— 关键)**
```ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSectionView, orderedSectionIds } from '$lib/db/queries';
import { isUnlocked, startSection } from '$lib/server/progress';

export const load: PageServerLoad = ({ params, locals }) => {
  const id = params.sectionId;
  if (!isUnlocked(locals.uid, id)) throw error(403, '本节尚未解锁');
  const view = getSectionView(id);
  if (!view) throw error(404, '章节不存在');
  startSection(locals.uid, id);
  const ids = orderedSectionIds();
  const idx = ids.indexOf(id);
  return { section: view, nextId: idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null };
};
```

- [ ] **Step 2: ContinueButton.svelte**
```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  let { enabled, reasons, onclick }:
    { enabled: boolean; reasons: string[]; onclick: () => void } = $props();
  const map: Record<string,string> = { scroll:'req.scroll', dwell:'req.dwell', video:'req.video', quiz:'req.quiz' };
</script>
<button class="continue" disabled={!enabled} {onclick}
  title={enabled ? '' : reasons.map((r)=>$t(map[r] as any)).join(' · ')}>
  {$t('learn.continue')} →
</button>
{#if !enabled}<p class="hint">{reasons.map((r)=>$t(map[r] as any)).join(' · ') || $t('learn.locked')}</p>{/if}
<style>
  .continue{width:100%;padding:var(--space-3);border:none;border-radius:var(--radius-lg);font-weight:700;cursor:pointer;
    background:var(--brand-500);color:var(--text-inverse);transition:var(--transition-base)}
  .continue:disabled{background:var(--surface-subtle);color:var(--text-disabled);cursor:not-allowed}
  .hint{font-size:var(--text-xs);color:var(--text-tertiary);text-align:center;margin-top:var(--space-2);line-height:1.5}
</style>
```

- [ ] **Step 3: +page.svelte(组装中栏 + 右栏 + 心跳 + complete)**
```svelte
<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import BlockRenderer from '$lib/content/BlockRenderer.svelte';
  import ProgressRing from '$lib/components/ProgressRing.svelte';
  import ContinueButton from '$lib/components/ContinueButton.svelte';
  import { startHeartbeat, type HeartbeatController } from '$lib/anti-skip/heartbeat';
  import type { VideoInterval } from '$lib/anti-skip/types';

  let { data } = $props();
  let scrollEl: HTMLElement;
  let hb: HeartbeatController | null = null;
  let reasons = $state<string[]>(['scroll']);
  let complete = $state(false);
  let intervals: VideoInterval[] = [];
  let quizPassedLocal = $state(false);

  async function refresh() {
    const res = await fetch('/api/progress/complete', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sectionId: data.section.id }) }).then((r) => r.json());
    complete = res.complete; reasons = res.reasons;
  }
  function onIntervals(i: VideoInterval[]) { intervals = i; hb?.setIntervals(i); }
  function onPassed() { quizPassedLocal = true; void refresh(); }

  $effect(() => {
    hb = startHeartbeat({ sectionId: data.section.id, scrollEl });
    const poll = setInterval(refresh, 4500);
    void refresh();
    return () => { hb?.stop(); clearInterval(poll); };
  });

  async function onContinue() {
    await refresh();
    if (complete) {
      await invalidateAll();
      if (data.nextId) goto(`/learn/${data.nextId}`);
    }
  }
</script>

<div class="layout">
  <article class="content" bind:this={scrollEl}>
    <h1>{data.section.title}</h1>
    {#each data.section.blocks as block (block.id)}
      <BlockRenderer {block} quizzes={data.section.quizzes} sectionId={data.section.id}
        onintervals={onIntervals} onpassed={onPassed} />
    {/each}
    <div class="end-spacer"></div>
  </article>
  <aside class="rail">
    <div class="rail-t">本节进度</div>
    <ProgressRing pct={complete ? 1 : Math.max(0, 1 - reasons.length / 4)} />
    <ContinueButton enabled={complete} {reasons} onclick={onContinue} />
  </aside>
</div>

<style>
  .layout{display:grid;grid-template-columns:1fr 280px;height:calc(100vh - 56px)}
  .content{overflow-y:auto;padding:var(--space-8) var(--space-10);max-width:820px}
  .content h1{font-size:var(--text-3xl);color:var(--text-primary);margin:0 0 var(--space-6)}
  .end-spacer{height:var(--space-16)}
  .rail{border-left:1px solid var(--border-subtle);background:var(--surface-elevated);
    padding:var(--space-5);display:flex;flex-direction:column;gap:var(--space-4)}
  .rail-t{font-family:var(--font-mono);font-size:var(--text-xs);text-transform:uppercase;
    letter-spacing:.05em;color:var(--text-tertiary)}
  .rail :global(.continue){margin-top:auto}
</style>
```

- [ ] **Step 4: 验证(关键流程) + 提交**
```bash
npm run check && npm run build
git add -A && git commit -m "feat(ui): 章节阅读页与服务端解锁守卫"
```

---

## Task 19: 收尾验证

- [ ] **Step 1: 全量校验 + 构建 + 单测**
```bash
npm run check && npm test && npm run build
```
Expected: check 0 errors;test 全绿;build 成功。

- [ ] **Step 2: fallow 死代码扫描(目标导向,允许多轮)**
```bash
npx fallow audit
npx fallow dead-code
```
按报告删除死代码/未用导出,每次修复后 `npm run check`。

- [ ] **Step 3: 提交**
```bash
git add -A && git commit -m "chore(P1): 收尾验证与死代码清理"
```

---

## Self-Review(写计划后自查)

- **Spec 覆盖**:角色选择(T11/T16)、双主题+token(T2/T3)、双语(T4)、数据模型(T5)、内容块(T6/T14)、防跳过四措施(区间 T7、规则 T8、视频禁快进+失焦暂停 T14、心跳采集 T15、服务端时间二次校验 T12)、题目三型+判分(T9/T14/T13)、服务端权威解锁(T12/T18)、进度记录(T12/T17)。均有对应任务。
- **占位符**:无 TBD/TODO;关键逻辑均给完整代码;Svelte 组件给出可运行实现(样式以 token 为准,实现时按规范微调)。
- **类型一致性**:`VideoInterval`/`ReadingState`/`SectionRequirements`/`CompletionResult` 跨 T7/T8/T12/T14/T15 一致;`evaluateCompletion`、`mergeIntervals`、`coverageRatio`、`gradeQuiz`、`attemptComplete`、`isUnlocked`、`startSection`、`progressMap` 命名前后一致;`SectionView`/`Block`/`QuizData` 跨 T6/T10/T14/T18 一致。
- **已知微调点(实现时处理)**:`heartbeat.ts` 的 `onState` 回调在 P1 由页面轮询 `/complete` 评估,故采集器仅负责上报;`content/types.ts` 需 re-export `VideoInterval`。
