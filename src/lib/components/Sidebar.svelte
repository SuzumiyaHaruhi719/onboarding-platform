<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { ModuleWithSections } from '$lib/db/queries';
	import Icon from '$lib/components/Icon.svelte';
	import { useI18n } from '$lib/i18n/context';

	let {
		modules,
		progress,
		orderedIds,
		editable = false
	}: {
		modules: ModuleWithSections[];
		progress: Record<string, string>;
		orderedIds: string[];
		editable?: boolean;
	} = $props();

	const i18n = useI18n();
	const tx = (zh: string, en: string): string => (i18n().lang === 'zh' ? zh : en);

	let creatingModule = $state(false);
	let moduleTitle = $state('');
	let creatingSectionFor = $state<string | null>(null);
	let sectionTitles = $state<Record<string, string>>({});
	let busy = $state(false);
	let notice = $state('');

	function isUnlocked(id: string): boolean {
		const i = orderedIds.indexOf(id);
		if (i <= 0) return true;
		return progress[orderedIds[i - 1]!] === 'completed';
	}

	async function post(url: string, body: unknown): Promise<Record<string, unknown> | null> {
		busy = true;
		notice = '';
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				notice = tx('创建失败，请稍后重试', 'Create failed. Please try again.');
				return null;
			}
			return (await res.json()) as Record<string, unknown>;
		} catch {
			notice = tx('网络异常，创建失败', 'Network error. Create failed.');
			return null;
		} finally {
			busy = false;
		}
	}

	async function createModule(): Promise<void> {
		const title = moduleTitle.trim();
		if (!title || busy) return;
		const created = await post('/api/editor/module', { title });
		const moduleId = typeof created?.id === 'string' ? created.id : null;
		if (!moduleId) return;
		const section = await post('/api/editor/section', { moduleId, title: tx('开始学习', 'Start here') });
		const sectionId = typeof section?.id === 'string' ? section.id : null;
		moduleTitle = '';
		creatingModule = false;
		notice = tx('模块已创建', 'Module created');
		if (sectionId) await goto(`/learn/${sectionId}`, { invalidateAll: true });
		else await invalidateAll();
	}

	async function createSection(moduleId: string): Promise<void> {
		const title = (sectionTitles[moduleId] ?? '').trim();
		if (!title || busy) return;
		const created = await post('/api/editor/section', { moduleId, title });
		const sectionId = typeof created?.id === 'string' ? created.id : null;
		sectionTitles = { ...sectionTitles, [moduleId]: '' };
		creatingSectionFor = null;
		notice = tx('章节已创建', 'Section created');
		if (sectionId) await goto(`/learn/${sectionId}`, { invalidateAll: true });
		else await invalidateAll();
	}
</script>

<aside class="sidebar" class:editable>
	{#if editable}
		<div class="structure-tools" aria-label={tx('课程结构管理', 'Course structure management')}>
			<div>
				<p class="tools-kicker">{tx('编辑结构', 'Structure')}</p>
				<strong>{tx('课程目录', 'Course outline')}</strong>
			</div>
			<button
				class="tool-add"
				aria-label={tx('创建新模块', 'Create module')}
				title={tx('创建新模块', 'Create module')}
				onclick={() => {
					creatingModule = !creatingModule;
					creatingSectionFor = null;
				}}
			>
				<Icon name="layers" size={15} />
				<span>{tx('新模块', 'Module')}</span>
			</button>
		</div>
		{#if creatingModule}
			<div class="create-row">
				<input
					bind:value={moduleTitle}
					placeholder={tx('模块名称', 'Module name')}
					aria-label={tx('模块名称', 'Module name')}
					onkeydown={(e) => {
						if (e.key === 'Enter') createModule();
						if (e.key === 'Escape') creatingModule = false;
					}}
				/>
				<button class="confirm" aria-label={tx('确认创建模块', 'Confirm module')} disabled={busy || !moduleTitle.trim()} onclick={createModule}>
					<Icon name="plus" size={15} />
				</button>
			</div>
		{/if}
		{#if notice}<p class="notice">{notice}</p>{/if}
	{/if}
	{#each modules as m (m.id)}
		<div class="mod-row">
			<div class="mod">{m.title}</div>
			{#if editable}
				<button
					class="mini-add"
					aria-label={tx(`在${m.title}中创建新章节`, `Create section in ${m.title}`)}
					title={tx('创建新章节', 'Create section')}
					onclick={() => {
						creatingSectionFor = creatingSectionFor === m.id ? null : m.id;
						creatingModule = false;
					}}
				>
					<Icon name="plus" size={14} />
					<span>{tx('章节', 'Section')}</span>
				</button>
			{/if}
		</div>
		{#if editable && creatingSectionFor === m.id}
			<div class="create-row section-create">
				<input
					value={sectionTitles[m.id] ?? ''}
					placeholder={tx('章节名称', 'Section name')}
					aria-label={tx(`${m.title}的新章节名称`, `New section name for ${m.title}`)}
					oninput={(e) => (sectionTitles = { ...sectionTitles, [m.id]: e.currentTarget.value })}
					onkeydown={(e) => {
						if (e.key === 'Enter') createSection(m.id);
						if (e.key === 'Escape') creatingSectionFor = null;
					}}
				/>
				<button class="confirm" aria-label={tx('确认创建章节', 'Confirm section')} disabled={busy || !(sectionTitles[m.id] ?? '').trim()} onclick={() => createSection(m.id)}>
					<Icon name="plus" size={15} />
				</button>
			</div>
		{/if}
		{#each m.sections as s (s.id)}
			{@const done = progress[s.id] === 'completed'}
			{@const open = editable || isUnlocked(s.id)}
			{#if open}
				<a class="navitem" class:active={page.params.sectionId === s.id} href={`/learn/${s.id}`}>
					{#if editable}
						<span class="ic"><Icon name="file-text" size={15} /></span>
					{:else}
						<span class="ic" class:done><Icon name={done ? 'circle-check' : 'circle'} size={16} /></span>
					{/if}
					<span class="title">{s.title}</span>
				</a>
			{:else}
				<span class="navitem locked" aria-disabled="true">
					<span class="ic"><Icon name="lock" size={15} /></span>
					<span class="title">{s.title}</span>
				</span>
			{/if}
		{/each}
	{/each}
</aside>

<style>
	.sidebar {
		width: 240px;
		flex: none;
		position: sticky;
		top: 56px;
		height: calc(100vh - 56px);
		align-self: start;
		background: var(--surface-container);
		border-right: 1px solid var(--border-subtle);
		padding: var(--space-4);
		overflow-y: auto;
	}
	.structure-tools {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
		padding: var(--space-3);
		border: 1px solid color-mix(in srgb, var(--accent-amber) 34%, var(--border-subtle));
		border-radius: var(--radius-lg);
		background:
			linear-gradient(135deg, var(--accent-amber-bg), transparent 58%),
			var(--surface-elevated);
		box-shadow: var(--shadow-sm);
	}
	.tools-kicker {
		margin: 0 0 2px;
		font-size: 10px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-tertiary);
	}
	.structure-tools strong {
		display: block;
		color: var(--text-primary);
		font-size: var(--text-sm);
		line-height: 1.2;
	}
	.tool-add,
	.mini-add,
	.confirm {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-page);
		color: var(--text-secondary);
		font-weight: 700;
		cursor: pointer;
		transition: var(--transition-fast);
	}
	.tool-add {
		min-height: 36px;
		padding: 0 var(--space-3);
		font-size: var(--text-xs);
		white-space: nowrap;
	}
	.tool-add:hover,
	.mini-add:hover,
	.confirm:hover:not(:disabled) {
		border-color: var(--accent-amber);
		background: var(--accent-amber-bg);
		color: var(--accent-amber);
	}
	.create-row {
		display: grid;
		grid-template-columns: 1fr 38px;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
		padding: var(--space-2);
		border: 1px solid color-mix(in srgb, var(--accent-amber) 42%, var(--border-subtle));
		border-radius: var(--radius-lg);
		background:
			linear-gradient(135deg, var(--accent-amber-bg), transparent 70%),
			var(--surface-elevated);
	}
	.create-row input {
		min-width: 0;
		min-height: 38px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: 0 var(--space-3);
		background: var(--surface-elevated);
		color: var(--text-primary);
		font: inherit;
	}
	.create-row input:focus {
		outline: 2px solid var(--brand-200);
		border-color: var(--brand-400);
	}
	.confirm {
		width: 38px;
		min-height: 38px;
		background: var(--accent-amber);
		border-color: var(--accent-amber);
		color: var(--text-inverse);
	}
	.confirm:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.notice {
		margin: 0 0 var(--space-3);
		color: var(--text-brand);
		font-size: var(--text-xs);
	}
	.mod-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin: var(--space-4) 0 var(--space-2);
	}
	.mod {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
		margin: 0;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.structure-tools + .mod-row,
	.notice + .mod-row,
	.create-row + .mod-row,
	.mod-row:first-of-type {
		margin-top: 0;
	}
	.mini-add {
		min-height: 28px;
		padding: 0 var(--space-2);
		font-size: 11px;
		flex: none;
	}
	.section-create {
		margin-top: calc(var(--space-1) * -1);
		margin-bottom: var(--space-2);
	}
	.navitem {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 42px;
		padding: var(--space-2) var(--space-3);
		border: 1px solid transparent;
		border-radius: var(--radius-lg);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		text-decoration: none;
		transition: var(--transition-fast);
	}
	a.navitem:hover {
		border-color: var(--border-subtle);
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.navitem.active {
		border-color: color-mix(in srgb, var(--brand-500) 36%, var(--border-default));
		background:
			linear-gradient(90deg, var(--brand-50), transparent 52%),
			var(--surface-elevated);
		color: var(--text-primary);
		box-shadow: var(--shadow-sm);
	}
	.navitem.locked {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.ic {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex: none;
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		color: var(--text-tertiary);
	}
	.navitem.active .ic {
		background: var(--brand-50);
		border: 1px solid var(--brand-200);
		color: var(--text-brand);
	}
	:global(:root[data-theme='dark']) .sidebar {
		background: linear-gradient(180deg, #090b0d 0%, #060708 100%);
		box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.025);
	}
	:global(:root[data-theme='dark']) .navitem {
		background: rgba(255, 255, 255, 0.012);
	}
	:global(:root[data-theme='dark']) .navitem.active {
		border-color: rgba(47, 212, 122, 0.34);
		background:
			linear-gradient(180deg, rgba(47, 212, 122, 0.075), rgba(47, 212, 122, 0.025)),
			#0a0c0e;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.045),
			0 10px 28px rgba(0, 0, 0, 0.28);
	}
	:global(:root[data-theme='dark']) .ic {
		background: #12161b;
	}
	:global(:root[data-theme='dark']) .structure-tools,
	:global(:root[data-theme='dark']) .create-row {
		background:
			linear-gradient(135deg, var(--accent-amber-bg), transparent 58%),
			linear-gradient(180deg, rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0)),
			#0a0c0e;
		border-color: color-mix(in srgb, var(--accent-amber) 28%, rgba(255, 255, 255, 0.1));
	}
	:global(:root[data-theme='dark']) .tool-add,
	:global(:root[data-theme='dark']) .mini-add {
		background: #080a0c;
		border-color: rgba(255, 255, 255, 0.1);
	}
	:global(:root[data-theme='dark']) .create-row input {
		background: #050607;
		border-color: rgba(255, 255, 255, 0.12);
	}
	.ic.done {
		color: var(--brand-500);
	}
	.title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 768px) {
		.sidebar {
			width: 100%;
			position: static;
			height: auto;
			max-height: none;
			display: flex;
			align-items: center;
			gap: var(--space-2);
			border-right: none;
			border-bottom: 1px solid var(--border-subtle);
			overflow-x: auto;
			overflow-y: hidden;
			scroll-snap-type: x proximity;
		}
		.mod {
			flex: none;
			margin: 0 var(--space-1) 0 0;
			max-width: 132px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.structure-tools,
		.create-row {
			flex: none;
			min-width: 220px;
			margin-bottom: 0;
		}
		.mod-row {
			flex: none;
			margin: 0 var(--space-1) 0 0;
			gap: var(--space-1);
		}
		.mini-add span,
		.tool-add span {
			display: none;
		}
		.sidebar.editable {
			display: block;
			overflow: visible;
		}
		.sidebar.editable .structure-tools,
		.sidebar.editable .create-row,
		.sidebar.editable .mod-row,
		.sidebar.editable .navitem {
			width: 100%;
			min-width: 0;
		}
		.sidebar.editable .structure-tools,
		.sidebar.editable .create-row {
			margin-bottom: var(--space-3);
		}
		.sidebar.editable .mod-row {
			margin: var(--space-4) 0 var(--space-2);
		}
		.sidebar.editable .navitem {
			margin-bottom: var(--space-1);
		}
		.sidebar.editable .mini-add span,
		.sidebar.editable .tool-add span {
			display: inline;
		}
		.navitem {
			flex: none;
			min-height: 38px;
			scroll-snap-align: start;
			border: 1px solid transparent;
			background: var(--surface-page);
		}
		.navitem.active {
			border-color: var(--border-default);
		}
	}
</style>
