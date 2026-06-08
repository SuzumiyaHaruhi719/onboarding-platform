<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { useI18n } from '$lib/i18n/context';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const i18n = useI18n();
	const tx = (zh: string, en: string): string => (i18n().lang === 'zh' ? zh : en);

	let newModuleTitle = $state('');
	let newSectionTitle = $state<Record<string, string>>({});
	let busy = $state(false);
	let notice = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let deleting = $state<{
		kind: 'module' | 'section';
		id: string;
		title: string;
		detail: string;
	} | null>(null);

	const moduleCount = $derived(data.modules.length);
	const sectionCount = $derived(data.modules.reduce((sum, m) => sum + m.sections.length, 0));
	const blockCount = $derived(
		data.modules.reduce((sum, m) => sum + m.sections.reduce((s, section) => s + section.blockCount, 0), 0)
	);
	const quizCount = $derived(
		data.modules.reduce((sum, m) => sum + m.sections.reduce((s, section) => s + section.quizCount, 0), 0)
	);

	async function post(url: string, body: unknown, method = 'POST'): Promise<{ ok?: boolean; id?: string } | null> {
		busy = true;
		notice = null;
		try {
			const response = await fetch(url, {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok || !payload?.ok) {
				notice = { type: 'error', text: tx('操作失败，请检查内容后重试。', 'Action failed. Check the content and try again.') };
				return null;
			}
			await invalidateAll();
			return payload;
		} catch {
			notice = { type: 'error', text: tx('网络或服务异常，请稍后重试。', 'Network or service error. Please try again later.') };
			return null;
		} finally {
			busy = false;
		}
	}

	async function addModule(): Promise<void> {
		const title = newModuleTitle.trim();
		if (!title) return;
		const created = await post('/api/editor/module', { title });
		if (created?.ok) {
			newModuleTitle = '';
			notice = { type: 'success', text: tx('模块已创建。', 'Module created.') };
		}
	}

	async function addSection(moduleId: string): Promise<void> {
		const title = (newSectionTitle[moduleId] ?? '').trim();
		if (!title) return;
		const created = await post('/api/editor/section', { moduleId, title });
		if (created?.ok) {
			newSectionTitle[moduleId] = '';
			notice = { type: 'success', text: tx('章节已创建，现在可以进入编辑。', 'Section created. You can edit it now.') };
		}
	}

	function requestDelete(
		kind: 'module' | 'section',
		id: string,
		title: string,
		detail: string
	): void {
		deleting = { kind, id, title, detail };
	}

	async function confirmDelete(): Promise<void> {
		if (!deleting) return;
		const target = deleting;
		deleting = null;
		const url = target.kind === 'module' ? '/api/editor/module' : '/api/editor/section';
		const deleted = await post(url, { id: target.id }, 'DELETE');
		if (deleted?.ok) notice = { type: 'success', text: target.kind === 'module' ? tx('模块已删除。', 'Module deleted.') : tx('章节已删除。', 'Section deleted.') };
	}
</script>

<div class="wrap">
	<header class="head">
		<div>
			<p class="eyebrow"><span class="dot"></span>{tx('编辑者工作区', 'Editor workspace')}</p>
			<h1>{tx('课程控制台', 'Course console')}</h1>
			<p class="sub">{tx('组织模块和章节，进入内联编辑器，再用真实学生视图检查学习路径。', 'Organize modules and sections, edit inline, then verify the learning path in the live learner view.')}</p>
		</div>
		<div class="head-actions">
			<a class="btn-secondary" href="/learn?view=learner">
				<Icon name="graduation-cap" size={15} /> {tx('学生视图', 'Learner view')}
			</a>
			<a class="btn-primary" href={data.modules[0]?.sections[0] ? `/learn/${data.modules[0].sections[0].id}` : '#new-module'}>
				<Icon name="square-pen" size={15} /> {tx('进入编辑器', 'Open editor')}
			</a>
		</div>
	</header>

	<section class="stats" aria-label={tx('课程统计', 'Course statistics')}>
		<div class="stat">
			<span class="stat-num">{moduleCount}</span>
			<span class="stat-label">{tx('模块', 'Modules')}</span>
		</div>
		<div class="stat">
			<span class="stat-num">{sectionCount}</span>
			<span class="stat-label">{tx('章节', 'Sections')}</span>
		</div>
		<div class="stat">
			<span class="stat-num">{blockCount}</span>
			<span class="stat-label">{tx('内容块', 'Blocks')}</span>
		</div>
		<div class="stat">
			<span class="stat-num">{quizCount}</span>
			<span class="stat-label">{tx('题目', 'Quizzes')}</span>
		</div>
	</section>

	<section class="creator" id="new-module">
		<div>
			<h2>{tx('新建模块', 'Create module')}</h2>
			<p>{tx('模块用于承载一组按顺序解锁的入职章节。', 'Modules contain onboarding sections that unlock in order.')}</p>
		</div>
		<div class="newmod">
			<input
				class="input"
				placeholder={tx('例如：合规与安全入门', 'Example: Compliance and safety basics')}
				bind:value={newModuleTitle}
				onkeydown={(e) => e.key === 'Enter' && addModule()}
			/>
			<button class="btn-primary" onclick={addModule} disabled={busy || !newModuleTitle.trim()}>
				<Icon name="plus" size={15} /> {tx('新建', 'Create')}
			</button>
		</div>
	</section>

	{#if notice}
		<p class="notice" class:error={notice.type === 'error'}>{notice.text}</p>
	{/if}

	{#if data.modules.length === 0}
		<section class="empty">
			<div class="empty-icon"><Icon name="file-text" size={24} /></div>
			<h2>{tx('还没有课程内容', 'No course content yet')}</h2>
			<p>{tx('先创建第一个模块，再添加章节。每个章节都可以插入富文本、视频和题目。', 'Create the first module, then add sections. Each section can contain rich text, video, and quizzes.')}</p>
		</section>
	{/if}

	{#each data.modules as m (m.id)}
		<section class="module">
			<div class="module-head">
				<div>
					<p class="module-kicker">{tx(`模块 ${m.order + 1}`, `Module ${m.order + 1}`)}</p>
					<h2>{m.title}</h2>
				</div>
				<div class="module-actions">
					<span class="module-count">{tx(`${m.sections.length} 章节`, `${m.sections.length} sections`)}</span>
					<button
						class="btn-ghost danger"
						onclick={() =>
							requestDelete('module', m.id, m.title, tx(`将同时删除 ${m.sections.length} 个章节及其全部内容。`, `This also deletes ${m.sections.length} sections and all of their content.`))}
						disabled={busy}
					>
						<Icon name="trash-2" size={15} /> {tx('删除模块', 'Delete module')}
					</button>
				</div>
			</div>

			{#if m.sections.length === 0}
				<div class="module-empty">
					<Icon name="file-text" size={18} />
					<span>{tx('这个模块还没有章节。创建章节后即可进入编辑器。', 'This module has no sections yet. Create a section to enter the editor.')}</span>
				</div>
			{:else}
				<ul class="sections">
					{#each m.sections as s, index (s.id)}
						<li>
							<a class="sec-link" href={`/learn/${s.id}`}>
								<span class="sec-index">{index + 1}</span>
								<span class="sec-copy">
									<span class="sec-title">{s.title}</span>
									<span class="sec-meta">
										<span>{tx(`${Math.round(s.minDwellMs / 1000)}s 最短阅读`, `${Math.round(s.minDwellMs / 1000)}s min read`)}</span>
										<span>{tx(`${s.blockCount} 内容块`, `${s.blockCount} blocks`)}</span>
										<span>{tx(`${s.quizCount} 题目`, `${s.quizCount} quizzes`)}</span>
									</span>
								</span>
								<span class="sec-open"><Icon name="arrow-right" size={16} /></span>
							</a>
							<div class="row-actions">
								<a class="icon-btn" href={`/learn/${s.id}`} aria-label={tx(`编辑 ${s.title}`, `Edit ${s.title}`)} title={tx('编辑', 'Edit')}>
									<Icon name="pencil" size={15} />
								</a>
								<a class="icon-btn" href={`/learn/${s.id}?view=learner`} aria-label={tx(`学生视图 ${s.title}`, `Learner view ${s.title}`)} title={tx('学生视图', 'Learner view')}>
									<Icon name="graduation-cap" size={15} />
								</a>
								<button
									class="icon-btn danger"
									onclick={() => requestDelete('section', s.id, s.title, tx('将删除本章节的内容块、题目和学习进度。', 'This deletes the section blocks, quizzes, and learning progress.'))}
									disabled={busy}
									aria-label={tx(`删除 ${s.title}`, `Delete ${s.title}`)}
									title={tx('删除', 'Delete')}
								>
									<Icon name="trash-2" size={15} />
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="newsec">
				<input
					class="input"
					placeholder={tx('新章节标题，例如：第一天必读', 'New section title, e.g. Day one essentials')}
					value={newSectionTitle[m.id] ?? ''}
					oninput={(e) => (newSectionTitle[m.id] = e.currentTarget.value)}
					onkeydown={(e) => e.key === 'Enter' && addSection(m.id)}
				/>
				<button class="btn-secondary" onclick={() => addSection(m.id)} disabled={busy || !(newSectionTitle[m.id] ?? '').trim()}>
					<Icon name="plus" size={15} /> {tx('新建章节', 'Create section')}
				</button>
			</div>
		</section>
	{/each}
</div>

{#if deleting}
	<div class="dialog-bg" role="presentation">
		<button class="dialog-scrim" aria-label={tx('取消删除', 'Cancel delete')} onclick={() => (deleting = null)}></button>
		<div class="dialog" role="dialog" aria-modal="true" aria-label={tx('确认删除', 'Confirm delete')} tabindex="-1">
			<div class="dialog-icon"><Icon name="trash-2" size={20} /></div>
			<h2>{tx(`删除「${deleting.title}」？`, `Delete "${deleting.title}"?`)}</h2>
			<p>{deleting.detail}</p>
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
		margin-bottom: var(--space-8);
		gap: var(--space-6);
	}
	.eyebrow,
	.module-kicker {
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
		max-width: 560px;
		color: var(--text-tertiary);
		margin: var(--space-3) 0 0;
	}
	.head-actions,
	.module-actions,
	.row-actions,
	.dialog-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-3);
		margin-bottom: var(--space-6);
	}
	.stat,
	.creator,
	.module,
	.empty {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		background: var(--surface-elevated);
		box-shadow: var(--shadow-sm);
	}
	.stat {
		padding: var(--space-4);
	}
	.stat-num {
		display: block;
		font-size: var(--text-3xl);
		font-weight: 800;
		line-height: 1;
		color: var(--text-primary);
	}
	.stat-label {
		display: block;
		margin-top: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-tertiary);
	}
	.creator {
		display: grid;
		grid-template-columns: minmax(220px, 0.7fr) minmax(320px, 1fr);
		align-items: center;
		gap: var(--space-5);
		padding: var(--space-5);
		margin-bottom: var(--space-4);
	}
	.creator h2,
	.module-head h2,
	.empty h2,
	.dialog h2 {
		margin: 0;
		color: var(--text-primary);
	}
	.creator h2,
	.module-head h2 {
		font-size: var(--text-xl);
	}
	.creator p,
	.empty p,
	.dialog p {
		margin: var(--space-1) 0 0;
		color: var(--text-tertiary);
		font-size: var(--text-sm);
	}
	.newmod,
	.newsec {
		display: flex;
		gap: var(--space-2);
	}
	.newsec {
		margin-top: var(--space-4);
	}
	.input {
		flex: 1;
		min-width: 0;
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
	.notice {
		margin: var(--space-3) 0 var(--space-4);
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
	.module {
		padding: var(--space-5);
		margin-bottom: var(--space-5);
	}
	.module-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}
	.module-kicker {
		margin-bottom: var(--space-1);
	}
	.module-count {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		white-space: nowrap;
	}
	.sections {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.sections li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-2);
	}
	.sec-link {
		min-width: 0;
		display: grid;
		grid-template-columns: 34px minmax(0, 1fr) 24px;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
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
	.sec-index {
		width: 30px;
		height: 30px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		background: var(--brand-50);
		border: 1px solid var(--brand-200);
		color: var(--text-brand);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 700;
	}
	.sec-copy {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.sec-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 700;
	}
	.sec-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-tertiary);
	}
	.sec-open {
		color: var(--text-tertiary);
	}
	.module-empty {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-lg);
		color: var(--text-tertiary);
		font-size: var(--text-sm);
	}
	.empty {
		text-align: center;
		padding: var(--space-12) var(--space-8);
		margin-top: var(--space-5);
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
	.btn-primary,
	.btn-secondary,
	.btn-ghost,
	.btn-danger,
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		border-radius: var(--radius-lg);
		font-size: var(--text-sm);
		font-weight: 700;
		cursor: pointer;
		transition: var(--transition-base);
		white-space: nowrap;
		text-decoration: none;
	}
	.btn-primary,
	.btn-secondary,
	.btn-ghost,
	.btn-danger {
		padding: var(--space-2) var(--space-4);
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
	.btn-secondary:hover:not(:disabled),
	.icon-btn:hover:not(:disabled) {
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
	.btn-danger {
		border: none;
		background: var(--error);
		color: var(--text-inverse);
	}
	.btn-ghost.danger:hover:not(:disabled),
	.icon-btn.danger:hover:not(:disabled) {
		color: var(--error);
		background: var(--error-bg);
	}
	.icon-btn {
		width: 34px;
		height: 34px;
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		color: var(--text-secondary);
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
	.dialog-icon {
		background: var(--error-bg);
		border-color: var(--error);
		color: var(--error);
	}
	.dialog-actions {
		justify-content: center;
		margin-top: var(--space-5);
	}

	@media (max-width: 900px) {
		.head,
		.creator,
		.module-head {
			grid-template-columns: 1fr;
			flex-direction: column;
			align-items: stretch;
		}
		.head-actions,
		.module-actions {
			justify-content: flex-start;
			flex-wrap: wrap;
		}
		.stats {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 640px) {
		.wrap {
			padding: var(--space-6) var(--space-4) var(--space-16);
		}
		h1 {
			font-size: var(--text-3xl);
		}
		.stats {
			grid-template-columns: 1fr 1fr;
		}
		.creator,
		.module {
			padding: var(--space-4);
		}
		.newmod,
		.newsec,
		.sections li {
			grid-template-columns: 1fr;
			flex-direction: column;
			align-items: stretch;
		}
		.row-actions {
			justify-content: flex-end;
		}
		.sec-link {
			grid-template-columns: 30px minmax(0, 1fr);
		}
		.sec-open {
			display: none;
		}
	}
</style>
