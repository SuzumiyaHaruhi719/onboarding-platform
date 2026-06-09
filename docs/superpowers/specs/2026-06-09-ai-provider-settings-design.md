# AI 供应商设置面板 · 设计

> 日期:2026-06-09 · 状态:已确认,待实现

## 目标

在编辑者工作区新增**设置面板**,让编辑者在 UI 里配置驱动 AI 转译的大模型 API,
**支持任意第三方供应商**,可保存多套配置并一键切换当前启用的那套。

## 关键洞察

现有 `src/lib/server/agent.ts` 已经在调用 **OpenAI 兼容**的 `/chat/completions`
端点(`Authorization: Bearer <key>`)。因此"支持所有供应商"无需为每家写适配器——
只要让用户配置 `baseUrl + apiKey + model` 即可覆盖 OpenAI、DeepSeek、通义千问(DashScope)、
Moonshot、OpenRouter、Groq、本地 Ollama,以及任何 OpenAI 兼容网关。**复用现有调用路径,
不引入任何供应商 SDK。**

## 决策(已与用户确认)

1. **密钥存储:数据库权威。** 设置面板是唯一权威来源,API Key 等写入 SQLite
   (`data.sqlite` 已 gitignore,风险面与 `.env` 同级)。`.env` 仅作首次默认种子。
   前端**只写不回显**:接口绝不返回明文 key,只返回"是否已设置 + 末 4 位"。
2. **多套档案,可切换。** 可保存多个供应商档案,全表至多一个 `active=1`,即当前启用项。

## 数据模型

新增表 `ai_profiles`(Drizzle,`src/lib/db/schema.ts`):

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | text PK | uuid |
| `name` | text notNull | 档案显示名,如「线上通义」 |
| `provider` | text notNull | 预设 id:`openai`/`dashscope`/`deepseek`/`moonshot`/`openrouter`/`groq`/`ollama`/`custom` |
| `base_url` | text notNull | OpenAI 兼容根地址 |
| `model` | text notNull | 模型名 |
| `api_key` | text notNull default '' | 明文;空字符串表示免密(如 Ollama 本地) |
| `timeout_ms` | integer notNull default 60000 | 请求超时 |
| `active` | integer notNull default 0 | 0/1,至多一个为 1 |
| `created_at` | integer notNull | epoch ms |

**单一启用**用 `active` 标志列实现(切换时在一个 better-sqlite3 事务内把旧的置 0、
新的置 1),不另开 settings 表——更简单且够用(YAGNI)。

## 配置解析与回退链

新增 `src/lib/server/ai-settings.ts`,核心 `resolveActiveAiConfig(): AiConfig | null`:

1. DB 中 `active=1` 且**可用**(有 `base_url` + `model`)的档案 → 用它;
2. 否则若 `.env` 有 `DASHSCOPE_API_KEY` → 用 env 派生配置,并**懒迁移**:
   若库中 0 档案且 env 有 key,自动建一条 `active` 档案(让现有 .env 配置无缝变成"档案 #1");
3. 都没有 → 返回 `null` → 维持现有"本地解析兜底"行为。

`AiConfig = { baseUrl, apiKey, model, timeoutMs }`(`apiKey` 可为空串)。

## 对现有代码的改动

- **`agent.ts`**:不再在模块加载时从 env 读 `BASE`/`MODEL`/`TIMEOUT`;改为每次调用时
  `resolveActiveAiConfig()` 解析。**无 key 时省略 `Authorization` 头**(支持 Ollama 等免密端点)。
  `convertWithAgent(text)` 内部解析配置;无可用配置则抛错(由 ingest 兜底捕获)。
- **`ingest.ts`**:`hasAgentKey()` → `hasActiveAiConfig()`(DB 有可用 active 档案 **或** env 有 key)。
  日志文案微调(不再特指 qwen)。

## API 端点

全部 `requireEditor(locals)` 守卫 + Zod 边界校验;**key 绝不返回前端 / 绝不日志**。
路径沿用现有 `/api/editor/*` 风格,返回 `{ ok, ... }` 信封。

| 方法 · 路径 | 作用 |
|------------|------|
| `GET  /api/editor/settings/ai` | 列出档案(key 脱敏:`keySet` + `keyHint` 末 4 位)+ 预设 + activeId |
| `POST /api/editor/settings/ai` | 新建档案 |
| `PUT  /api/editor/settings/ai/[id]` | 更新(key 留空 = 保持原值不变) |
| `DELETE /api/editor/settings/ai/[id]` | 删除(若删的是 active,则置空 active) |
| `POST /api/editor/settings/ai/[id]/activate` | 设为当前启用 |
| `POST /api/editor/settings/ai/test` | 连接测试:发一个 `max_tokens:1` 极小请求,回 `{ok, latencyMs}` 或真实错误 |

`/test` 既支持按 `id` 测已存档案,也支持测"表单里尚未保存的内联配置"(便于保存前先验)。
对内联配置,若 key 为空且测的是已有档案,则用库里的真实 key。

## 设置页 `/editor/settings`

- **入口**:编辑器控制台(`src/routes/editor/+page.svelte`)header `head-actions` 加「⚙ 设置 / Settings」链接。
- **`+page.server.ts`**:`requireEditor` + 加载脱敏档案列表、预设、activeId。
- **`+page.svelte`**:沿用现有编辑器设计令牌(CSS 变量)与 `tx(zh,en)` 双语模式。
  - 档案卡片列表,**启用中**高亮;每张含:启用 / 测试 / 编辑 / 删除。
  - 新建/编辑表单:**供应商预设下拉**(选中自动填 `baseUrl` + 默认 `model`)、`name`、
    `baseUrl`、`model`、`apiKey`(写入型:已设置时占位显示 `sk-****1234`,留空保持不变)、`timeoutMs`。
  - 测试按钮即时反馈:"连通 ✓ 320ms" 或错误信息。

## 安全

- API Key 绝不返回前端、绝不写日志;只回 `keySet`/`keyHint`。
- `baseUrl` 必须为 `http(s)` URL(Zod 校验);`name`/`model` 非空。
- 所有写操作 `requireEditor` + Zod。
- **SSRF 面**:仅受信编辑者能让服务端向任意 URL 发测试请求。本应用为自托管单实例、
  编辑者即管理员,可接受;此处明确记录该取舍。

## 测试

抽出纯函数做 Vitest 单测(沿用项目"纯逻辑单测"惯例):

- `maskKey(key)` → 末 4 位 + 是否已设置;
- `applyPreset(providerId)` → 正确的 baseUrl/defaultModel;
- `resolveActiveAiConfig` 的优先级:active 档案 > env > null(以纯函数 `pickConfig(profile|null, env|null)` 形式被测);
- 单一启用不变量(activate 后仅一个 active)——以纯 reducer 或对内存 DB 验证。

DB CRUD 与端点走启动后手动/集成验证。

## 部署衔接

新表靠 `db:push` 建。

- **新克隆者**:`start.mjs` 在 DB 不存在时自动跑 `db:push`,覆盖新表;
- **现有 `data.sqlite`**:实现时跑一次 `npm run db:push` 增量补表(不动既有数据)。
