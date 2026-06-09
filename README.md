# 新员工入职阅读平台 · Onboarding Platform

类 Kognity 的**强制阅读式**入职学习网站。学员必须完整读完文档、看完视频、答对题目才能逐节解锁;**不得以任何形式跳过**。编辑者可手工编排内容,或上传文件由多模态 agent(qwen3.7-plus)转译为内容块。

> 当前进度:**P1 学员核心 + P2 编辑器 + P3 多模态转译** 已完成。P4(真鉴权 / 分析看板 / 响应式打磨)待做。
> 设计与计划见 [`docs/superpowers/`](docs/superpowers/)。

## 功能

- **学员端**:三栏阅读界面、服务端权威防跳过、实时进度与完成要求清单、单选/多选/判断题门禁。
- **编辑端**(`/editor`):模块/章节/内容块/题目的增删改 + 拖序、视频上传、章节最短阅读时长设置。
- **AI 供应商设置**(`/editor/settings`):面板内配置驱动转译的大模型 API,**支持任意 OpenAI 兼容供应商**(OpenAI / 通义 DashScope / DeepSeek / Moonshot / OpenRouter / Groq / 本地 Ollama / 自定义)。可保存多套档案、一键切换启用、连接测试。
- **AI 转译**:上传 txt/md/docx/pdf/pptx → 当前启用的模型转成符合设计规范的内容块(无可用配置时本地解析兜底)。
- **双主题 + 中英双语**,严格遵循 GLP 设计规范。

## 技术栈

SvelteKit(Svelte 5 runes)· TypeScript(strict)· Drizzle ORM + better-sqlite3 · Zod(边界校验)· 纯 CSS 变量(双主题设计令牌)· Vitest(核心纯逻辑)· adapter-node。

## 快速开始(一键拉起)

clone 下来后**点一下**即可,自动检查 Node、装依赖、建库填种子、起服务并开浏览器:

- **Windows**:双击 `start.cmd`
- **macOS / Linux**:`./start.sh`(或任意平台 `npm start`)

默认拉起 `http://127.0.0.1:5180/`;**5180 被占用会自动顺延端口并在终端显示**实际地址,再自动用默认浏览器打开。前置只需装好 [Node 20+](https://nodejs.org/)。

### 手动开始(等价步骤)

```sh
npm install
cp .env.example .env        # 填入轮换后的 DASHSCOPE_API_KEY 才启用 AI 转译(否则本地兜底)
npm run db:push             # 在 SQLite 建表
npm run db:seed             # 填充示例课程(1 模块 / 2 节 / 视频 + 题目)
npm run dev -- --port 5180  # 5173 常被占用,指定其它端口
```

进站选「新员工」进入学习,选「编辑者」进入 `/editor` 工作区。

> ⚠️ 本机若开着 Clash 代理,localhost 可能打不开——把 `localhost`/`127.0.0.1` 加入 NO_PROXY,或直接访问 `http://127.0.0.1:5180/`。

## 常用脚本

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` / `npm run preview` | 生产构建 / 本地预览 |
| `npm run check` | svelte-check + tsc 类型检查 |
| `npm test` | Vitest 单元测试(防跳过引擎 / 判分) |
| `npm run db:push` / `npm run db:seed` | 建表 / 填充种子 |
| `npx fallow dead-code` / `npx fallow audit` | 死代码与变更审计 |

## 目录结构

```
src/
  lib/
    design/      设计令牌(浅/深双主题)+ 主题切换
    i18n/        中英字典 + 响应式 context translator
    content/     内容块类型(含 BlockInput/QuizInput/EditorQuiz)+ 各块组件 + BlockRenderer
    anti-skip/   防跳过:区间引擎 / 完成规则 / 常量 / 客户端心跳采集
    quiz/        判分逻辑(纯函数)
    db/          Drizzle schema / client / 查询 / serde / 种子
    server/      会话 · 进度服务 · Zod schema · guard · editor(CRUD)· media · extract · converter · agent(qwen)· ingest
    components/  ThemeToggle · LangToggle · Sidebar · ProgressRing · ContinueButton · RequirementChecklist · editor/{BlockForm,QuizForm}
  routes/
    +page.svelte             角色选择落地页
    api/                     role · progress/{heartbeat,complete} · quiz/submit · editor/{module,section,block,block/reorder,quiz,upload,ingest}
    media/[file]/            上传视频的流式服务
    learn/[sectionId]/       学员三栏阅读界面 + 服务端解锁守卫
    editor/                  编辑者工作区(dashboard + sections/[id] 块/题/视频/AI 转译)
```

## 防跳过设计(核心)

**前端只是壳,完成判定全部在服务端校验。** 改前端无法绕过。

- **解锁守卫**:`learn/[sectionId]/+page.server.ts` 仅在上一节 `completed` 时才下发本节内容;否则 403。
- **服务端单调累计**(`lib/server/progress.ts`):阅读心跳上报的 `dwell / 滚动 / 视频`,服务端只增不减,且**每次心跳最多记一个时间窗**(`MAX_CREDIT_WINDOW_MS`),杜绝伪造。
- **视频**:禁快进、禁倍速、失焦暂停(`VideoBlock.svelte`);服务端按窗口限速,只信任从 0 起的**连续前缀**覆盖,并用墙钟时间做合理性闸。
- **题目**:服务端判分(`lib/quiz/grade.ts`),答错有**次数上限 + 冷却**;正确答案绝不下发客户端。
- **完成判定**:四项防作弊(视频 / 切屏暂停 / 最短停留 / 滚动到底)+ 题目答对全过,服务端才签发完成并返回 `nextId`。

> 并发不变量:`progress.ts` 内每个写函数在读→算→写之间**无 `await`**,在单线程 Node + 同步 better-sqlite3 下天然原子。改动时勿在中途插入 `await`。

## 安全

- 密钥**绝不入代码**;`.env` 仅作首次默认种子(见 `.env.example`)。AI 档案密钥经设置面板存入 SQLite(`data.sqlite` 已 gitignore,风险面与 `.env` 同级),仅编辑者可写,接口**绝不回显**明文(只返回「是否已设置 + 末 4 位」)。
- 所有不可信入参经 Zod 校验;所有完成判定服务端权威。
- P1 用匿名 cookie 标识身份(无敏感数据);真鉴权在 P4。
