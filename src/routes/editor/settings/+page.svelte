<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { useI18n } from '$lib/i18n/context';
	import { PROVIDER_PRESETS, getPreset } from '$lib/ai/presets';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const i18n = useI18n();
	const tx = (zh: string, en: string): string => (i18n().lang === 'zh' ? zh : en);

	let busy = $state(false);
	let notice = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// Add/edit form
	let showForm = $state(false);
	let editingId = $state<string | null>(null);
	let fName = $state('');
	let fProvider = $state('openai');
	let fBaseUrl = $state('');
	let fModel = $state('');
	let fKey = $state('');
	let fTimeoutSec = $state('');
	let editingKeySet = $state(false);
	let editingKeyHint = $state('');

	// Connection test — `for` is 'form' or a profile id, so results render in the right place.
	let test = $state<{ for: string; testing: boolean; ok?: boolean; latencyMs?: number; error?: string } | null>(null);

	let deleting = $state<{ id: string; name: string } | null>(null);

	const baseUrlValid = $derived(/^https?:\/\//i.test(fBaseUrl.trim()));
	const formValid = $derived(!!fName.trim() && baseUrlValid && !!fModel.trim());
	const activePreset = $derived(getPreset(fProvider));

	async function post(url: string, body: unknown, method = 'POST'): Promise<{ ok?: boolean } | null> {
		busy = true;
		notice = null;
		try {
			const res = await fetch(url, {
				method,
				headers: { 'content-type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body)
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok || !payload?.ok) {
				notice = { type: 'error', text: tx('操作失败,请检查内容后重试。', 'Action failed. Check the input and try again.') };
				return null;
			}
			await invalidateAll();
			return payload;
		} catch {
			notice = { type: 'error', text: tx('网络或服务异常,请稍后重试。', 'Network or service error. Please try again later.') };
			return null;
		} finally {
			busy = false;
		}
	}

	function openCreate(): void {
		const p = getPreset('openai');
		editingId = null;
		fName = '';
		fProvider = 'openai';
		fBaseUrl = p.baseUrl;
		fModel = p.defaultModel;
		fKey = '';
		fTimeoutSec = '';
		editingKeySet = false;
		editingKeyHint = '';
		test = null;
		notice = null;
		showForm = true;
	}

	function openEdit(profile: PageData['profiles'][number]): void {
		editingId = profile.id;
		fName = profile.name;
		fProvider = profile.provider;
		fBaseUrl = profile.baseUrl;
		fModel = profile.model;
		fKey = '';
		fTimeoutSec = profile.timeoutMs ? String(Math.round(profile.timeoutMs / 1000)) : '';
		editingKeySet = profile.keySet;
		editingKeyHint = profile.keyHint;
		test = null;
		notice = null;
		showForm = true;
	}

	function closeForm(): void {
		showForm = false;
		test = null;
	}

	/** Selecting a preset prefills its endpoint + default model. */
	function onPresetChange(): void {
		const p = getPreset(fProvider);
		if (p.id !== 'custom') {
			fBaseUrl = p.baseUrl;
			fModel = p.defaultModel;
		}
	}

	function timeoutMs(): number | undefined {
		const n = Number(fTimeoutSec);
		return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : undefined;
	}

	function formBody() {
		return {
			name: fName.trim(),
			provider: fProvider,
			baseUrl: fBaseUrl.trim(),
			model: fModel.trim(),
			apiKey: fKey ? fKey : undefined,
			timeoutMs: timeoutMs()
		};
	}

	async function save(): Promise<void> {
		if (!formValid) return;
		const url = editingId ? `/api/editor/settings/ai/${editingId}` : '/api/editor/settings/ai';
		const r = await post(url, formBody(), editingId ? 'PUT' : 'POST');
		if (r?.ok) {
			notice = { type: 'success', text: editingId ? tx('档案已更新。', 'Profile updated.') : tx('档案已创建。', 'Profile created.') };
			closeForm();
		}
	}

	/** Test a config. target='form' uses current form fields; otherwise an existing profile id. */
	async function runTest(target: string, body: { id?: string; baseUrl: string; model: string; apiKey?: string; timeoutMs?: number }): Promise<void> {
		test = { for: target, testing: true };
		try {
			const res = await fetch('/api/editor/settings/ai/test', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok || !payload?.ok) {
				test = { for: target, testing: false, ok: false, error: tx('无法发起测试', 'Could not run test') };
				return;
			}
			test = { for: target, testing: false, ...payload.result };
		} catch {
			test = { for: target, testing: false, ok: false, error: tx('网络异常', 'Network error') };
		}
	}

	function testForm(): void {
		if (!baseUrlValid || !fModel.trim()) return;
		runTest('form', { id: editingId ?? undefined, baseUrl: fBaseUrl.trim(), model: fModel.trim(), apiKey: fKey ? fKey : undefined, timeoutMs: timeoutMs() });
	}

	function testProfile(profile: PageData['profiles'][number]): void {
		runTest(profile.id, { id: profile.id, baseUrl: profile.baseUrl, model: profile.model });
	}

	async function activate(id: string): Promise<void> {
		const r = await post(`/api/editor/settings/ai/${id}/activate`, undefined);
		if (r?.ok) notice = { type: 'success', text: tx('已切换启用档案。', 'Active profile switched.') };
	}

	async function confirmDelete(): Promise<void> {
		if (!deleting) return;
		const target = deleting;
		deleting = null;
		const r = await post(`/api/editor/settings/ai/${target.id}`, undefined, 'DELETE');
		if (r?.ok) notice = { type: 'success', text: tx('档案已删除。', 'Profile deleted.') };
	}

	function providerLabel(id: string): string {
		return getPreset(id).label;
	}
</script>

<div class="wrap">
	<header class="head">
		<div>
			<p class="eyebrow"><span class="dot"></span>{tx('编辑者工作区', 'Editor workspace')}</p>
			<h1>{tx('AI 供应商设置', 'AI provider settings')}</h1>
			<p class="sub">{tx('配置驱动文档转译的大模型 API。支持任意 OpenAI 兼容供应商,可保存多套并一键切换当前启用。', 'Configure the model API that powers document translation. Any OpenAI-compatible provider works; save multiple and switch the active one.')}</p>
		</div>
		<div class="head-actions">
			<a class="btn-secondary" href="/editor"><Icon name="arrow-right" size={15} /> {tx('返回控制台', 'Back to console')}</a>
			<button class="btn-primary" onclick={openCreate} disabled={busy}><Icon name="plus" size={15} /> {tx('新建档案', 'New profile')}</button>
		</div>
	</header>

	{#if notice}
		<p class="notice" class:error={notice.type === 'error'}>{notice.text}</p>
	{/if}

	{#if data.profiles.length === 0}
		<section class="empty">
			<div class="empty-icon"><Icon name="sparkles" size={24} /></div>
			<h2>{tx('还没有 AI 档案', 'No AI profiles yet')}</h2>
			<p>{tx('新建一个供应商档案即可启用 AI 转译;未配置时上传文档会走本地解析兜底。', 'Create a provider profile to enable AI translation. Without one, uploads fall back to local parsing.')}</p>
			<button class="btn-primary" onclick={openCreate}><Icon name="plus" size={15} /> {tx('新建档案', 'New profile')}</button>
		</section>
	{/if}

	{#if data.profiles.length > 0}
		<ul class="cards">
			{#each data.profiles as p (p.id)}
				<li class="card" class:active={p.active}>
					<div class="card-main">
						<div class="card-top">
							<span class="provider-chip"><Icon name="sparkles" size={13} /> {providerLabel(p.provider)}</span>
							{#if p.active}<span class="active-badge"><Icon name="circle-check" size={13} /> {tx('启用中', 'Active')}</span>{/if}
						</div>
						<h2>{p.name}</h2>
						<dl class="meta">
							<div><dt>{tx('模型', 'Model')}</dt><dd class="mono">{p.model}</dd></div>
							<div><dt>{tx('端点', 'Endpoint')}</dt><dd class="mono trunc">{p.baseUrl}</dd></div>
							<div><dt>{tx('密钥', 'API key')}</dt><dd class="mono">{p.keySet ? `••••${p.keyHint}` : tx('未设置', 'not set')}</dd></div>
						</dl>
						{#if test && test.for === p.id}
							<p class="test-line" class:bad={test.ok === false}>
								{#if test.testing}{tx('测试中…', 'Testing…')}
								{:else if test.ok}<Icon name="circle-check" size={14} /> {tx('连通', 'Connected')} · {test.latencyMs}ms
								{:else}<Icon name="info" size={14} /> {test.error}{/if}
							</p>
						{/if}
					</div>
					<div class="card-actions">
						{#if !p.active}
							<button class="btn-secondary" onclick={() => activate(p.id)} disabled={busy}><Icon name="circle-check" size={15} /> {tx('设为启用', 'Activate')}</button>
						{/if}
						<button class="btn-ghost" onclick={() => testProfile(p)} disabled={!!test?.testing}><Icon name="zap" size={15} /> {tx('测试', 'Test')}</button>
						<button class="btn-ghost" onclick={() => openEdit(p)} disabled={busy}><Icon name="pencil" size={15} /> {tx('编辑', 'Edit')}</button>
						<button class="btn-ghost danger" onclick={() => (deleting = { id: p.id, name: p.name })} disabled={busy}><Icon name="trash-2" size={15} /> {tx('删除', 'Delete')}</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#if showForm}
	<div class="dialog-bg" role="presentation">
		<button class="dialog-scrim" aria-label={tx('关闭', 'Close')} onclick={closeForm}></button>
		<div class="dialog form-dialog" role="dialog" aria-modal="true" aria-label={editingId ? tx('编辑档案', 'Edit profile') : tx('新建档案', 'New profile')} tabindex="-1">
			<h2>{editingId ? tx('编辑档案', 'Edit profile') : tx('新建档案', 'New profile')}</h2>

			<label class="field">
				<span>{tx('供应商预设', 'Provider preset')}</span>
				<select class="input" bind:value={fProvider} onchange={onPresetChange}>
					{#each PROVIDER_PRESETS as preset (preset.id)}
						<option value={preset.id}>{preset.label}</option>
					{/each}
				</select>
			</label>

			<label class="field">
				<span>{tx('档案名称', 'Profile name')}</span>
				<input class="input" bind:value={fName} placeholder={tx('例如:线上通义', 'e.g. Production OpenAI')} />
			</label>

			<label class="field">
				<span>{tx('Base URL(OpenAI 兼容,以 /v1 结尾)', 'Base URL (OpenAI-compatible, ends with /v1)')}</span>
				<input class="input mono" class:bad={!!fBaseUrl && !baseUrlValid} bind:value={fBaseUrl} placeholder="https://api.openai.com/v1" />
			</label>

			<label class="field">
				<span>{tx('模型', 'Model')}</span>
				<input class="input mono" bind:value={fModel} placeholder={activePreset.defaultModel || 'gpt-4o-mini'} />
			</label>

			<label class="field">
				<span>{tx('API Key', 'API key')}{activePreset.keyless ? tx(' · 本地端点通常免密', ' · local endpoints are usually keyless') : ''}</span>
				<input
					class="input mono"
					type="password"
					autocomplete="off"
					bind:value={fKey}
					placeholder={editingKeySet ? tx(`已设置 ••••${editingKeyHint},留空保持不变`, `Set ••••${editingKeyHint} — leave blank to keep`) : activePreset.keyless ? tx('可留空', 'optional') : 'sk-...'}
				/>
			</label>

			<label class="field">
				<span>{tx('超时(秒,可选)', 'Timeout (seconds, optional)')}</span>
				<input class="input mono" inputmode="numeric" bind:value={fTimeoutSec} placeholder="60" />
			</label>

			{#if test && test.for === 'form'}
				<p class="test-line" class:bad={test.ok === false}>
					{#if test.testing}{tx('测试中…', 'Testing…')}
					{:else if test.ok}<Icon name="circle-check" size={14} /> {tx('连通', 'Connected')} · {test.latencyMs}ms
					{:else}<Icon name="info" size={14} /> {test.error}{/if}
				</p>
			{/if}

			<div class="dialog-actions">
				<button class="btn-ghost" onclick={closeForm}>{tx('取消', 'Cancel')}</button>
				<button class="btn-secondary" onclick={testForm} disabled={!baseUrlValid || !fModel.trim() || !!test?.testing}><Icon name="zap" size={15} /> {tx('测试连接', 'Test')}</button>
				<button class="btn-primary" onclick={save} disabled={busy || !formValid}><Icon name="check" size={15} /> {tx('保存', 'Save')}</button>
			</div>
		</div>
	</div>
{/if}

{#if deleting}
	<div class="dialog-bg" role="presentation">
		<button class="dialog-scrim" aria-label={tx('取消删除', 'Cancel delete')} onclick={() => (deleting = null)}></button>
		<div class="dialog" role="dialog" aria-modal="true" aria-label={tx('确认删除', 'Confirm delete')} tabindex="-1">
			<div class="dialog-icon"><Icon name="trash-2" size={20} /></div>
			<h2>{tx(`删除「${deleting.name}」?`, `Delete "${deleting.name}"?`)}</h2>
			<p>{tx('删除后若它是启用档案,AI 转译将回退到 .env 或本地解析。', 'If it was the active profile, AI translation falls back to .env or local parsing.')}</p>
			<div class="dialog-actions">
				<button class="btn-ghost" onclick={() => (deleting = null)}>{tx('取消', 'Cancel')}</button>
				<button class="btn-danger" onclick={confirmDelete} disabled={busy}>{tx('确认删除', 'Delete')}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.wrap {
		max-width: 1120px;
		margin: 0 auto;
		padding: var(--space-10) var(--content-padding-x) var(--space-24);
	}
	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-bottom: var(--space-6);
		gap: var(--space-6);
	}
	.eyebrow {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-brand);
		margin: 0 0 var(--space-2);
	}
	.eyebrow .dot {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--brand-500);
	}
	h1 {
		font-size: var(--text-4xl);
		font-weight: 800;
		color: var(--text-primary);
		margin: 0;
		line-height: 1.15;
	}
	.sub {
		max-width: 620px;
		color: var(--text-tertiary);
		margin: var(--space-3) 0 0;
	}
	.head-actions,
	.card-actions,
	.dialog-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.notice {
		margin: 0 0 var(--space-4);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--brand-200);
		border-radius: var(--radius-lg);
		background: var(--brand-50);
		color: var(--text-brand);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.notice.error {
		border-color: var(--error);
		background: var(--error-bg);
		color: var(--error);
	}
	.empty {
		text-align: center;
		padding: var(--space-12) var(--space-8);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		background: var(--surface-elevated);
		box-shadow: var(--shadow-sm);
	}
	.empty h2 {
		margin: 0;
		color: var(--text-primary);
	}
	.empty p {
		margin: var(--space-2) auto var(--space-5);
		max-width: 460px;
		color: var(--text-tertiary);
		font-size: var(--text-sm);
	}
	.empty-icon,
	.dialog-icon {
		width: 48px;
		height: 48px;
		margin: 0 auto var(--space-3);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-full);
		background: var(--brand-50);
		border: 1px solid var(--brand-200);
		color: var(--text-brand);
	}
	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.card {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		background: var(--surface-elevated);
		box-shadow: var(--shadow-sm);
	}
	.card.active {
		border-color: var(--brand-500);
		box-shadow: 0 0 0 3px var(--brand-200);
	}
	.card-main {
		min-width: 0;
	}
	.card-top {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}
	.provider-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		background: var(--surface-page);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-full);
		padding: 2px var(--space-2);
	}
	.active-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--text-brand);
		background: var(--brand-50);
		border: 1px solid var(--brand-200);
		border-radius: var(--radius-full);
		padding: 2px var(--space-2);
	}
	.card-main h2 {
		margin: 0 0 var(--space-3);
		font-size: var(--text-xl);
		color: var(--text-primary);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-5);
		margin: 0;
	}
	.meta div {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.meta dt {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
	}
	.meta dd {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-secondary);
		max-width: 420px;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.trunc {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.test-line {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin: var(--space-3) 0 0;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-brand);
	}
	.test-line.bad {
		color: var(--error);
	}
	.card-actions {
		flex-wrap: wrap;
		justify-content: flex-end;
		flex: none;
	}
	.btn-primary,
	.btn-secondary,
	.btn-ghost,
	.btn-danger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-lg);
		font-size: var(--text-sm);
		font-weight: 700;
		cursor: pointer;
		transition: var(--transition-base);
		white-space: nowrap;
		text-decoration: none;
	}
	.btn-primary {
		border: none;
		background: var(--brand-500);
		color: var(--text-inverse);
	}
	.btn-primary:hover:not(:disabled) {
		background: var(--brand-600);
	}
	.btn-secondary {
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		color: var(--text-primary);
	}
	.btn-secondary:hover:not(:disabled) {
		background: var(--surface-hover);
	}
	.btn-ghost {
		border: none;
		background: transparent;
		color: var(--text-tertiary);
	}
	.btn-ghost:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.btn-ghost.danger:hover:not(:disabled) {
		color: var(--error);
		background: var(--error-bg);
	}
	.btn-danger {
		border: none;
		background: var(--error);
		color: var(--text-inverse);
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.dialog-bg {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-6);
		background: rgba(0, 0, 0, 0.45);
		overflow-y: auto;
	}
	.dialog-scrim {
		position: absolute;
		inset: 0;
		border: none;
		background: transparent;
		cursor: default;
	}
	.dialog {
		position: relative;
		z-index: 1;
		width: min(420px, 100%);
		padding: var(--space-6);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		background: var(--surface-elevated);
		box-shadow: var(--shadow-lg);
		text-align: center;
	}
	.form-dialog {
		width: min(540px, 100%);
		text-align: left;
		margin: auto;
	}
	.dialog h2 {
		margin: 0 0 var(--space-2);
		color: var(--text-primary);
		font-size: var(--text-xl);
	}
	.dialog p {
		margin: 0;
		color: var(--text-tertiary);
		font-size: var(--text-sm);
	}
	.dialog-icon {
		background: var(--error-bg);
		border-color: var(--error);
		color: var(--error);
	}
	.field {
		display: block;
		margin-top: var(--space-4);
	}
	.field span {
		display: block;
		margin-bottom: var(--space-1);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-secondary);
	}
	.input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-page);
		color: var(--text-primary);
		font-size: var(--text-sm);
	}
	.input:focus {
		outline: none;
		border-color: var(--brand-500);
		box-shadow: 0 0 0 3px var(--brand-200);
	}
	.input.bad {
		border-color: var(--error);
	}
	.dialog-actions {
		justify-content: flex-end;
		margin-top: var(--space-5);
		flex-wrap: wrap;
	}
	.dialog .dialog-icon + h2 {
		text-align: center;
	}

	@media (max-width: 720px) {
		.head,
		.card {
			flex-direction: column;
			align-items: stretch;
		}
		.head-actions,
		.card-actions {
			flex-wrap: wrap;
		}
	}
</style>
