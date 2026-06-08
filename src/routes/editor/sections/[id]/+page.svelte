<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import BlockForm from '$lib/components/editor/BlockForm.svelte';
	import QuizForm from '$lib/components/editor/QuizForm.svelte';
	import type { Block, BlockInput, QuizInput, EditorQuiz } from '$lib/content/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Snapshot section meta once for the editable form fields.
	const initSection = untrack(() => data.section);
	let title = $state(initSection.title);
	let minDwellSec = $state(Math.round(initSection.minDwellMs / 1000));
	let metaMsg = $state('');

	let addingBlock = $state(false);
	let editingBlockId = $state<string | null>(null);
	let addingQuiz = $state(false);
	let editingQuizId = $state<string | null>(null);
	let uploading = $state(false);
	let busy = $state(false);

	const TYPE_LABEL: Record<string, string> = {
		heading: '标题',
		paragraph: '正文',
		list: '列表',
		quote: '引用',
		callout: '提示',
		image: '图片',
		video: '视频',
		quiz: '题目占位'
	};

	function summary(b: Block): string {
		switch (b.type) {
			case 'heading':
				return `H${b.level} · ${b.text}`;
			case 'paragraph':
				return b.text.slice(0, 70);
			case 'list':
				return `${b.ordered ? '有序' : '无序'} · ${b.items.length} 项`;
			case 'quote':
				return b.text.slice(0, 50);
			case 'callout':
				return `${b.variant} · ${b.title}`;
			case 'image':
				return b.alt || b.src;
			case 'video':
				return `${b.durationSec}s · ${b.src}`;
			case 'quiz':
				return '学员在此处作答本节题目';
		}
	}

	async function api(url: string, body: unknown, method = 'POST'): Promise<Response | null> {
		busy = true;
		const res = await fetch(url, {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}).catch(() => null);
		await invalidateAll();
		busy = false;
		return res;
	}

	async function saveSectionMeta(): Promise<void> {
		await api('/api/editor/section', { id: data.section.id, title: title.trim(), minDwellMs: minDwellSec * 1000 }, 'PATCH');
		metaMsg = '已保存';
		setTimeout(() => (metaMsg = ''), 1500);
	}

	async function createBlock(block: BlockInput): Promise<void> {
		await api('/api/editor/block', { sectionId: data.section.id, block });
		addingBlock = false;
	}
	async function updateBlock(id: string, block: BlockInput): Promise<void> {
		await api('/api/editor/block', { id, block }, 'PATCH');
		editingBlockId = null;
	}
	async function deleteBlock(id: string): Promise<void> {
		if (!confirm('删除该内容块?')) return;
		await api('/api/editor/block', { id }, 'DELETE');
	}
	async function moveBlock(id: string, dir: -1 | 1): Promise<void> {
		const ids = data.blocks.map((b) => b.id);
		const i = ids.indexOf(id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j]!, ids[i]!];
		await api('/api/editor/block/reorder', { orderedIds: ids });
	}

	async function createQuiz(quiz: QuizInput): Promise<void> {
		await api('/api/editor/quiz', { sectionId: data.section.id, quiz });
		addingQuiz = false;
	}
	async function updateQuiz(id: string, quiz: QuizInput): Promise<void> {
		await api('/api/editor/quiz', { id, quiz }, 'PATCH');
		editingQuizId = null;
	}
	async function deleteQuiz(id: string): Promise<void> {
		if (!confirm('删除该题目?')) return;
		await api('/api/editor/quiz', { id }, 'DELETE');
	}

	function readDuration(file: File): Promise<number> {
		return new Promise((resolve, reject) => {
			const v = document.createElement('video');
			v.preload = 'metadata';
			v.onloadedmetadata = () => {
				resolve(v.duration || 10);
				URL.revokeObjectURL(v.src);
			};
			v.onerror = () => reject(new Error('metadata error'));
			v.src = URL.createObjectURL(file);
		});
	}

	async function onVideoFile(e: Event): Promise<void> {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		uploading = true;
		const dur = await readDuration(file).catch(() => 10);
		const fd = new FormData();
		fd.append('file', file);
		const res = await fetch('/api/editor/upload', { method: 'POST', body: fd })
			.then((r) => r.json())
			.catch(() => null);
		uploading = false;
		input.value = '';
		if (res?.ok) {
			await createBlock({ type: 'video', src: res.url, durationSec: Math.round(dur) });
		} else {
			alert('上传失败:' + (res?.error ?? '未知错误'));
		}
	}

	function answerText(q: EditorQuiz): string {
		if (q.type === 'boolean') return q.answer === true ? '对' : '错';
		if (q.type === 'single') return q.options[q.answer as number] ?? '?';
		return (q.answer as number[]).map((i) => q.options[i] ?? '?').join('、');
	}
</script>

<div class="wrap">
	<a class="back" href="/editor">← 返回工作区</a>

	<section class="card">
		<div class="rowline">
			<label class="field grow">
				<span>章节标题</span>
				<input class="inp" bind:value={title} />
			</label>
			<label class="field">
				<span>最短阅读(秒)</span>
				<input class="inp narrow" type="number" min="0" bind:value={minDwellSec} />
			</label>
			<button class="btn-primary" onclick={saveSectionMeta} disabled={busy}>保存</button>
			{#if metaMsg}<span class="ok">{metaMsg}</span>{/if}
		</div>
	</section>

	<section class="card">
		<div class="card-head">
			<h2>内容块</h2>
			<div class="head-actions">
				<label class="btn-secondary upload">
					{uploading ? '上传中…' : '上传视频'}
					<input type="file" accept="video/*" hidden onchange={onVideoFile} disabled={uploading} />
				</label>
				<button class="btn-primary" onclick={() => (addingBlock = true)} disabled={addingBlock}>+ 添加块</button>
			</div>
		</div>

		{#if addingBlock}
			<BlockForm onsave={createBlock} oncancel={() => (addingBlock = false)} />
		{/if}

		{#if data.blocks.length === 0 && !addingBlock}
			<p class="empty">还没有内容块。点击"添加块"或"上传视频"。</p>
		{/if}

		<ul class="blocks">
			{#each data.blocks as b, i (b.id)}
				<li>
					{#if editingBlockId === b.id}
						<BlockForm
							initial={b}
							onsave={(input) => updateBlock(b.id, input)}
							oncancel={() => (editingBlockId = null)}
						/>
					{:else}
						<div class="block-row">
							<span class="badge">{TYPE_LABEL[b.type]}</span>
							<span class="bsum">{summary(b)}</span>
							<div class="ops">
								<button class="icon" onclick={() => moveBlock(b.id, -1)} disabled={i === 0 || busy} aria-label="上移">↑</button>
								<button class="icon" onclick={() => moveBlock(b.id, 1)} disabled={i === data.blocks.length - 1 || busy} aria-label="下移">↓</button>
								<button class="icon" onclick={() => (editingBlockId = b.id)} aria-label="编辑">✎</button>
								<button class="icon danger" onclick={() => deleteBlock(b.id)} disabled={busy} aria-label="删除">🗑</button>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<section class="card">
		<div class="card-head">
			<h2>题库({data.quizzes.length})</h2>
			<button class="btn-primary" onclick={() => (addingQuiz = true)} disabled={addingQuiz}>+ 添加题目</button>
		</div>
		<p class="note">提示:题目要在学员端显示,需在内容块中放一个"题目占位"块。答错题目无法进入下一节。</p>

		{#if addingQuiz}
			<QuizForm onsave={createQuiz} oncancel={() => (addingQuiz = false)} />
		{/if}

		<ul class="quizzes">
			{#each data.quizzes as q (q.id)}
				<li>
					{#if editingQuizId === q.id}
						<QuizForm initial={q} onsave={(input) => updateQuiz(q.id, input)} oncancel={() => (editingQuizId = null)} />
					{:else}
						<div class="quiz-row">
							<div class="qmain">
								<span class="badge">{q.type === 'single' ? '单选' : q.type === 'multiple' ? '多选' : '判断'}</span>
								<span class="qq">{q.question}</span>
								<span class="qa">答案:{answerText(q)}</span>
							</div>
							<div class="ops">
								<button class="icon" onclick={() => (editingQuizId = q.id)} aria-label="编辑">✎</button>
								<button class="icon danger" onclick={() => deleteQuiz(q.id)} disabled={busy} aria-label="删除">🗑</button>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.wrap {
		max-width: 860px;
		margin: 0 auto;
		padding: var(--space-8) var(--content-padding-x) var(--space-24);
	}
	.back {
		display: inline-block;
		color: var(--text-tertiary);
		font-size: var(--text-sm);
		margin-bottom: var(--space-5);
	}
	.back:hover {
		color: var(--text-primary);
	}
	.card {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-2xl);
		background: var(--surface-elevated);
		box-shadow: var(--shadow-sm);
		padding: var(--space-6);
		margin-bottom: var(--space-6);
	}
	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-4);
	}
	.card-head h2 {
		font-size: var(--text-lg);
		color: var(--text-primary);
		margin: 0;
	}
	.head-actions {
		display: flex;
		gap: var(--space-2);
	}
	.rowline {
		display: flex;
		align-items: flex-end;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.field.grow {
		flex: 1;
		min-width: 200px;
	}
	.field span {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
	}
	.inp {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-page);
		color: var(--text-primary);
		font-size: var(--text-sm);
		width: 100%;
	}
	.inp.narrow {
		width: 110px;
	}
	.inp:focus {
		outline: none;
		border-color: var(--brand-500);
		box-shadow: 0 0 0 3px var(--brand-200);
	}
	.blocks,
	.quizzes {
		list-style: none;
		margin: var(--space-4) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.block-row,
	.quiz-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background: var(--surface-page);
	}
	.qmain {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex: 1;
		min-width: 0;
		flex-wrap: wrap;
	}
	.badge {
		flex: none;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-brand);
		background: var(--brand-50);
		border: 1px solid var(--brand-200);
		border-radius: var(--radius-md);
		padding: 2px var(--space-2);
	}
	.bsum,
	.qq {
		flex: 1;
		min-width: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.qa {
		font-size: var(--text-xs);
		color: var(--success);
	}
	.ops {
		display: flex;
		gap: var(--space-1);
		flex: none;
	}
	.icon {
		width: 30px;
		height: 30px;
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		cursor: pointer;
		transition: var(--transition-fast);
	}
	.icon:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.icon.danger:hover:not(:disabled) {
		color: var(--error);
		border-color: var(--error);
	}
	.icon:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.empty,
	.note {
		color: var(--text-tertiary);
		font-size: var(--text-sm);
	}
	.note {
		margin: 0 0 var(--space-3);
	}
	.btn-primary,
	.btn-secondary {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-lg);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		transition: var(--transition-base);
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
	.upload {
		display: inline-flex;
		align-items: center;
	}
	.ok {
		color: var(--success);
		font-size: var(--text-sm);
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
