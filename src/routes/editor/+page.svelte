<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let newModuleTitle = $state('');
	let newSectionTitle = $state<Record<string, string>>({});
	let busy = $state(false);

	async function post(url: string, body: unknown, method = 'POST'): Promise<void> {
		busy = true;
		await fetch(url, {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}).catch(() => {});
		await invalidateAll();
		busy = false;
	}

	async function addModule(): Promise<void> {
		const title = newModuleTitle.trim();
		if (!title) return;
		newModuleTitle = '';
		await post('/api/editor/module', { title });
	}

	async function addSection(moduleId: string): Promise<void> {
		const title = (newSectionTitle[moduleId] ?? '').trim();
		if (!title) return;
		newSectionTitle[moduleId] = '';
		await post('/api/editor/section', { moduleId, title });
	}

	async function delModule(id: string): Promise<void> {
		if (!confirm('删除该模块及其全部章节?此操作不可撤销。')) return;
		await post('/api/editor/module', { id }, 'DELETE');
	}

	async function delSection(id: string): Promise<void> {
		if (!confirm('删除该章节及其全部内容?')) return;
		await post('/api/editor/section', { id }, 'DELETE');
	}
</script>

<div class="wrap">
	<header class="head">
		<div>
			<p class="eyebrow"><span class="dot"></span>编辑者工作区</p>
			<h1>课程内容管理</h1>
		</div>
		<a class="preview-link" href="/learn">以学员身份预览 →</a>
	</header>

	<div class="newmod">
		<input
			class="input"
			placeholder="新模块标题…"
			bind:value={newModuleTitle}
			onkeydown={(e) => e.key === 'Enter' && addModule()}
		/>
		<button class="btn-primary" onclick={addModule} disabled={busy}>新建模块</button>
	</div>

	{#if data.modules.length === 0}
		<p class="empty">还没有内容。先新建一个模块,再往里加章节。</p>
	{/if}

	{#each data.modules as m (m.id)}
		<section class="module">
			<div class="module-head">
				<h2>{m.title}</h2>
				<button class="btn-ghost danger" onclick={() => delModule(m.id)} disabled={busy}>删除模块</button>
			</div>

			<ul class="sections">
				{#each m.sections as s (s.id)}
					<li>
						<a class="sec-link" href={`/editor/sections/${s.id}`}>
							<span class="sec-title">{s.title}</span>
							<span class="sec-meta">最短阅读 {Math.round(s.minDwellMs / 1000)}s</span>
						</a>
						<button class="btn-ghost danger" onclick={() => delSection(s.id)} disabled={busy}>删除</button>
					</li>
				{/each}
			</ul>

			<div class="newsec">
				<input
					class="input"
					placeholder="新章节标题…"
					value={newSectionTitle[m.id] ?? ''}
					oninput={(e) => (newSectionTitle[m.id] = e.currentTarget.value)}
					onkeydown={(e) => e.key === 'Enter' && addSection(m.id)}
				/>
				<button class="btn-secondary" onclick={() => addSection(m.id)} disabled={busy}>新建章节</button>
			</div>
		</section>
	{/each}
</div>

<style>
	.wrap {
		max-width: 920px;
		margin: 0 auto;
		padding: var(--space-10) var(--content-padding-x) var(--space-24);
	}
	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-bottom: var(--space-8);
		gap: var(--space-4);
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
		font-size: var(--text-3xl);
		font-weight: 800;
		color: var(--text-primary);
		margin: 0;
	}
	.preview-link {
		font-size: var(--text-sm);
		color: var(--text-brand);
		white-space: nowrap;
	}
	.newmod,
	.newsec {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-6);
	}
	.input {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-elevated);
		color: var(--text-primary);
		font-size: var(--text-sm);
	}
	.input:focus {
		outline: none;
		border-color: var(--brand-500);
		box-shadow: 0 0 0 3px var(--brand-200);
	}
	.module {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-2xl);
		background: var(--surface-elevated);
		box-shadow: var(--shadow-sm);
		padding: var(--space-6);
		margin-bottom: var(--space-6);
	}
	.module-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-4);
	}
	.module-head h2 {
		font-size: var(--text-xl);
		color: var(--text-primary);
		margin: 0;
	}
	.sections {
		list-style: none;
		margin: 0 0 var(--space-4);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.sections li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.sec-link {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background: var(--surface-page);
		color: var(--text-primary);
		transition: var(--transition-base);
	}
	.sec-link:hover {
		border-color: var(--border-strong);
		background: var(--surface-hover);
	}
	.sec-meta {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-tertiary);
	}
	.empty {
		color: var(--text-tertiary);
		padding: var(--space-8);
		text-align: center;
	}
	.btn-primary,
	.btn-secondary,
	.btn-ghost {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-lg);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		transition: var(--transition-base);
		white-space: nowrap;
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
	.btn-ghost.danger:hover:not(:disabled) {
		color: var(--error);
		background: var(--error-bg);
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
