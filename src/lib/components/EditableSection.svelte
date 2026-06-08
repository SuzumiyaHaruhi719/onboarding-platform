<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import BlockRenderer from '$lib/content/BlockRenderer.svelte';
	import BlockForm from '$lib/components/editor/BlockForm.svelte';
	import QuizForm from '$lib/components/editor/QuizForm.svelte';
	import type { SectionView, Block, BlockInput, QuizInput, EditorQuiz } from '$lib/content/types';

	let { section, quizzes }: { section: SectionView; quizzes: EditorQuiz[] } = $props();

	const JSON_HEADERS = { 'content-type': 'application/json' };
	const noop = (): void => {};

	let preview = $state(false);
	let busy = $state(false);

	// Section meta (snapshot, re-synced when navigating to another section)
	let title = $state(untrack(() => section.title));
	let minDwellSec = $state(untrack(() => Math.round(section.requirements.minDwellMs / 1000)));
	let metaMsg = $state('');
	let lastId = untrack(() => section.id);

	let editingId = $state<string | null>(null);
	let insertAt = $state<string | 'end' | null>(null);
	let editingQuizId = $state<string | null>(null);
	let addingQuiz = $state(false);

	// Re-sync editable fields when navigating to a different section (component reused).
	$effect(() => {
		if (section.id !== lastId) {
			lastId = section.id;
			title = section.title;
			minDwellSec = Math.round(section.requirements.minDwellMs / 1000);
			editingId = null;
			insertAt = null;
		}
	});

	const TYPE_LABEL: Record<string, string> = {
		heading: '标题', paragraph: '正文', list: '列表', quote: '引用',
		callout: '提示', image: '图片', video: '视频', quiz: '题目'
	};

	async function refresh(): Promise<void> {
		await invalidateAll();
	}
	async function call(url: string, body: unknown, method = 'POST'): Promise<{ ok?: boolean; id?: string } | null> {
		return fetch(url, { method, headers: JSON_HEADERS, body: JSON.stringify(body) })
			.then((r) => r.json())
			.catch(() => null);
	}

	async function saveMeta(): Promise<void> {
		busy = true;
		try {
			await call('/api/editor/section', { id: section.id, title: title.trim(), minDwellMs: minDwellSec * 1000 }, 'PATCH');
			await refresh();
			metaMsg = '已保存';
			setTimeout(() => (metaMsg = ''), 1500);
		} finally {
			busy = false;
		}
	}

	async function createBlock(block: BlockInput, afterId: string | 'end'): Promise<void> {
		busy = true;
		try {
			const r = await call('/api/editor/block', { sectionId: section.id, block });
			if (r?.ok && r.id && afterId !== 'end') {
				const ids = section.blocks.map((b) => b.id);
				const idx = ids.indexOf(afterId);
				if (idx >= 0) {
					const desired = [...ids.slice(0, idx + 1), r.id, ...ids.slice(idx + 1)];
					await call('/api/editor/block/reorder', { orderedIds: desired });
				}
			}
			await refresh();
		} finally {
			busy = false;
			insertAt = null;
		}
	}

	async function updateBlock(id: string, block: BlockInput): Promise<void> {
		busy = true;
		try {
			await call('/api/editor/block', { id, block }, 'PATCH');
			await refresh();
		} finally {
			busy = false;
			editingId = null;
		}
	}

	async function deleteBlock(id: string): Promise<void> {
		if (!confirm('删除该内容块?')) return;
		busy = true;
		try {
			await call('/api/editor/block', { id }, 'DELETE');
			await refresh();
		} finally {
			busy = false;
		}
	}

	async function moveBlock(id: string, dir: -1 | 1): Promise<void> {
		const ids = section.blocks.map((b) => b.id);
		const i = ids.indexOf(id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j]!, ids[i]!];
		busy = true;
		try {
			await call('/api/editor/block/reorder', { orderedIds: ids });
			await refresh();
		} finally {
			busy = false;
		}
	}

	async function createQuiz(quiz: QuizInput): Promise<void> {
		busy = true;
		try {
			await call('/api/editor/quiz', { sectionId: section.id, quiz });
			await refresh();
		} finally {
			busy = false;
			addingQuiz = false;
		}
	}
	async function updateQuiz(id: string, quiz: QuizInput): Promise<void> {
		busy = true;
		try {
			await call('/api/editor/quiz', { id, quiz }, 'PATCH');
			await refresh();
		} finally {
			busy = false;
			editingQuizId = null;
		}
	}
	async function deleteQuiz(id: string): Promise<void> {
		if (!confirm('删除该题目?')) return;
		busy = true;
		try {
			await call('/api/editor/quiz', { id }, 'DELETE');
			await refresh();
		} finally {
			busy = false;
		}
	}

	// ---- Video upload ----
	let uploading = $state(false);
	function readDuration(file: File): Promise<number> {
		return new Promise((resolve, reject) => {
			const v = document.createElement('video');
			v.preload = 'metadata';
			v.onloadedmetadata = () => {
				resolve(v.duration || 10);
				URL.revokeObjectURL(v.src);
			};
			v.onerror = () => reject(new Error('metadata'));
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
		const r = await fetch('/api/editor/upload', { method: 'POST', body: fd }).then((x) => x.json()).catch(() => null);
		input.value = '';
		uploading = false;
		if (r?.ok) await createBlock({ type: 'video', src: r.url, durationSec: Math.round(dur) }, 'end');
		else alert('上传失败:' + (r?.error ?? ''));
	}

	// ---- AI ingestion → preview → user chooses insertion position ----
	interface IngestEvent {
		t: number;
		msg: string;
	}
	let ingestBusy = $state(false);
	let ingestStage = $state('pending');
	let ingestStatus = $state('');
	let ingestElapsed = $state(0);
	let ingestTokens = $state(0);
	let ingestUsedAgent = $state(false);
	let ingestEvents = $state<IngestEvent[]>([]);
	let previewBlocks = $state<BlockInput[]>([]);
	let showPreview = $state(false);
	let insertPos = $state<string>('end');
	let inserting = $state(false);
	let timer: ReturnType<typeof setInterval> | null = null;

	const STAGE_LABEL: Record<string, string> = {
		pending: '排队中', extracting: '提取文本', converting: 'AI 转译中', ready: '转译完成', error: '失败'
	};
	const STAGE_PCT: Record<string, number> = {
		pending: 8, extracting: 35, converting: 75, ready: 100, error: 100
	};
	const ingestPct = $derived(STAGE_PCT[ingestStage] ?? 0);
	const previewRender = $derived(previewBlocks.map((b, i) => ({ ...b, id: `pv-${i}` }) as Block));

	function stopTimer(): void {
		if (timer) clearInterval(timer);
		timer = null;
	}

	async function onIngestFile(e: Event): Promise<void> {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		ingestBusy = true;
		ingestStage = 'pending';
		ingestStatus = '上传中';
		ingestEvents = [];
		ingestTokens = 0;
		ingestUsedAgent = false;
		ingestElapsed = 0;
		previewBlocks = [];
		const started = Date.now();
		stopTimer();
		timer = setInterval(() => (ingestElapsed = Math.round((Date.now() - started) / 1000)), 250);

		const fd = new FormData();
		fd.append('file', file);
		const res = await fetch('/api/editor/ingest', { method: 'POST', body: fd }).then((r) => r.json()).catch(() => null);
		input.value = '';
		if (!res?.ok) {
			stopTimer();
			ingestBusy = false;
			ingestStage = 'error';
			ingestStatus = '失败:' + (res?.error ?? '上传错误');
			return;
		}
		const jobId: string = res.jobId;
		const poll = async (): Promise<void> => {
			const s = await fetch(`/api/editor/ingest?jobId=${jobId}`).then((r) => r.json()).catch(() => null);
			if (!s?.ok) {
				stopTimer();
				ingestBusy = false;
				ingestStage = 'error';
				ingestStatus = '转译任务丢失(服务可能重启过),请重新上传';
				return;
			}
			ingestStage = s.status;
			ingestStatus = STAGE_LABEL[s.status] ?? s.status;
			ingestUsedAgent = !!s.usedAgent;
			if (typeof s.tokens === 'number') ingestTokens = s.tokens;
			if (Array.isArray(s.events)) ingestEvents = s.events;
			if (s.status === 'ready') {
				stopTimer();
				ingestBusy = false;
				previewBlocks = Array.isArray(s.blocks) ? s.blocks : [];
				insertPos = 'end';
				showPreview = true;
				return;
			}
			if (s.status === 'error') {
				stopTimer();
				ingestBusy = false;
				ingestStatus = '失败:' + (s.error ?? '转译失败');
				return;
			}
			setTimeout(poll, 1000);
		};
		void poll();
	}

	async function confirmInsert(): Promise<void> {
		if (previewBlocks.length === 0) return;
		inserting = true;
		try {
			const position = insertPos === 'start' || insertPos === 'end' ? insertPos : { afterId: insertPos };
			await call('/api/editor/blocks/insert', { sectionId: section.id, blocks: previewBlocks, position });
			await refresh();
			showPreview = false;
			previewBlocks = [];
		} finally {
			inserting = false;
		}
	}

	function cancelPreview(): void {
		showPreview = false;
		previewBlocks = [];
	}

	function onKey(e: KeyboardEvent): void {
		if (e.key === 'Escape' && showPreview && !inserting) cancelPreview();
	}

	$effect(() => () => stopTimer());
</script>

<svelte:window onkeydown={onKey} />

<div class="es">
	<div class="bar">
		<div class="bar-left">
			<input class="title-input" bind:value={title} aria-label="章节标题" />
			<label class="dwell">最短阅读
				<input type="number" min="0" bind:value={minDwellSec} /> 秒
			</label>
			<button class="btn-sm primary" onclick={saveMeta} disabled={busy}>保存</button>
			{#if metaMsg}<span class="ok">{metaMsg}</span>{/if}
		</div>
		<div class="bar-right">
			<label class="btn-sm ghost upload" class:busy={ingestBusy}>
				{ingestBusy ? 'AI 转译中…' : '🤖 AI 转译文件'}
				<input type="file" accept=".txt,.md,.markdown,.docx,.pdf,.pptx" hidden onchange={onIngestFile} disabled={ingestBusy} />
			</label>
			<label class="btn-sm ghost upload" class:busy={uploading}>
				{uploading ? '上传中…' : '🎬 上传视频'}
				<input type="file" accept="video/*" hidden onchange={onVideoFile} disabled={uploading} />
			</label>
			<button class="btn-sm ghost" class:active={preview} onclick={() => (preview = !preview)}>
				{preview ? '✎ 编辑' : '👁 预览'}
			</button>
		</div>
	</div>

	{#if ingestBusy || ingestStage === 'error'}
		<div class="ingest" class:err={ingestStage === 'error'}>
			<div class="ingest-top">
				<span>{ingestStatus}</span>
				<span class="mono">{ingestElapsed}s{ingestTokens ? ` · ${ingestTokens} tok` : ''}</span>
			</div>
			{#if ingestBusy}
				<div class="track"><div class="fill" class:pulse={ingestStage === 'converting'} style="width:{ingestPct}%"></div></div>
			{/if}
			{#if ingestEvents.length}
				<ul class="log mini">
					{#each ingestEvents.slice(-4) as ev (ev.t)}
						<li><span class="mono">+{(ev.t / 1000).toFixed(1)}s</span> {ev.msg}</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<article class="content">
		<p class="eyebrow"><span class="dot"></span>{section.title}</p>

		{#if preview}
			{#each section.blocks as block (block.id)}
				<BlockRenderer {block} quizzes={section.quizzes} sectionId={section.id} onintervals={noop} onpassed={noop} />
			{/each}
		{:else}
			{#if insertAt === section.blocks[0]?.id || (section.blocks.length === 0 && insertAt === 'end')}
				<!-- handled inline below -->
			{/if}
			{#if section.blocks.length === 0}
				<button class="insert-line" onclick={() => (insertAt = 'end')}>＋ 添加第一个内容块</button>
			{/if}
			{#each section.blocks as block, i (block.id)}
				<div class="eb" class:editing={editingId === block.id}>
					{#if editingId === block.id}
						<BlockForm initial={block as Block} onsave={(b) => updateBlock(block.id, b)} oncancel={() => (editingId = null)} />
					{:else}
						<div class="eb-preview">
							{#if block.type === 'quiz'}
								<div class="quiz-ph">📝 题目区 — 学员在此作答(本节 {quizzes.length} 题,见下方题库)</div>
							{:else}
								<BlockRenderer {block} quizzes={[]} sectionId={section.id} onintervals={noop} onpassed={noop} />
							{/if}
						</div>
						<div class="eb-ctrl">
							<span class="badge">{TYPE_LABEL[block.type]}</span>
							<button class="ic" onclick={() => moveBlock(block.id, -1)} disabled={i === 0 || busy} aria-label="上移">↑</button>
							<button class="ic" onclick={() => moveBlock(block.id, 1)} disabled={i === section.blocks.length - 1 || busy} aria-label="下移">↓</button>
							<button class="ic" onclick={() => (editingId = block.id)} aria-label="编辑">✎</button>
							<button class="ic danger" onclick={() => deleteBlock(block.id)} disabled={busy} aria-label="删除">🗑</button>
						</div>
					{/if}

					{#if insertAt === block.id}
						<div class="insert-form">
							<BlockForm onsave={(b) => createBlock(b, block.id)} oncancel={() => (insertAt = null)} />
						</div>
					{:else if editingId !== block.id}
						<button class="insert-line" onclick={() => (insertAt = block.id)}>＋ 在此后插入</button>
					{/if}
				</div>
			{/each}

			{#if insertAt === 'end'}
				<div class="insert-form">
					<BlockForm onsave={(b) => createBlock(b, 'end')} oncancel={() => (insertAt = null)} />
				</div>
			{:else if section.blocks.length > 0}
				<button class="insert-line end" onclick={() => (insertAt = 'end')}>＋ 在末尾添加内容块</button>
			{/if}

			<!-- Quiz bank -->
			<section class="qbank">
				<div class="qbank-head">
					<h3>题库({quizzes.length})</h3>
					<button class="btn-sm ghost" onclick={() => (addingQuiz = true)} disabled={addingQuiz}>＋ 添加题目</button>
				</div>
				<p class="hint">答错题目的学员无法进入下一节。题目通过"题目"内容块在正文中呈现。</p>
				{#if addingQuiz}
					<QuizForm onsave={createQuiz} oncancel={() => (addingQuiz = false)} />
				{/if}
				{#each quizzes as q (q.id)}
					{#if editingQuizId === q.id}
						<QuizForm initial={q} onsave={(quiz) => updateQuiz(q.id, quiz)} oncancel={() => (editingQuizId = null)} />
					{:else}
						<div class="qrow">
							<span class="badge">{q.type === 'single' ? '单选' : q.type === 'multiple' ? '多选' : '判断'}</span>
							<span class="qq">{q.question}</span>
							<button class="ic" onclick={() => (editingQuizId = q.id)} aria-label="编辑">✎</button>
							<button class="ic danger" onclick={() => deleteQuiz(q.id)} disabled={busy} aria-label="删除">🗑</button>
						</div>
					{/if}
				{/each}
			</section>
		{/if}
	</article>
</div>

{#if showPreview}
	<div class="modal-bg">
		<div class="modal" role="dialog" aria-modal="true" aria-label="AI 转译预览" tabindex="-1">
			<header class="modal-head">
				<strong>AI 转译预览 · {previewBlocks.length} 块</strong>
				<span class="badge">{ingestUsedAgent ? `qwen3.7-plus · ${ingestTokens} tokens` : '本地解析'}</span>
			</header>
			<div class="modal-body">
				<div class="preview-pane">
					{#if previewRender.length === 0}<p class="hint">没有可用内容。</p>{/if}
					{#each previewRender as block (block.id)}
						{#if block.type === 'quiz'}
							<div class="quiz-ph">📝 题目区</div>
						{:else}
							<BlockRenderer {block} quizzes={[]} sectionId={section.id} onintervals={noop} onpassed={noop} />
						{/if}
					{/each}
				</div>
				<aside class="log-pane">
					<div class="rail-label">事件日志</div>
					<ul class="log">
						{#each ingestEvents as ev (ev.t)}
							<li><span class="mono">+{(ev.t / 1000).toFixed(1)}s</span> {ev.msg}</li>
						{/each}
					</ul>
				</aside>
			</div>
			<footer class="modal-foot">
				<label class="pos">插入位置
					<select bind:value={insertPos}>
						<option value="start">章节开头</option>
						{#each section.blocks as b, i (b.id)}
							<option value={b.id}>第 {i + 1} 块之后 · {TYPE_LABEL[b.type]}</option>
						{/each}
						<option value="end">章节末尾</option>
					</select>
				</label>
				<div class="spacer"></div>
				<button class="btn-sm ghost" onclick={cancelPreview} disabled={inserting}>取消</button>
				<button class="btn-sm primary" onclick={confirmInsert} disabled={inserting}>
					{inserting ? '插入中…' : `确认插入(${previewBlocks.length} 块)`}
				</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.modal-bg {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgba(0, 0, 0, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-6);
	}
	.modal {
		width: min(960px, 100%);
		max-height: 86vh;
		display: flex;
		flex-direction: column;
		background: var(--surface-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-2xl);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
	}
	.modal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-6);
		border-bottom: 1px solid var(--border-default);
	}
	.modal-head strong {
		font-size: var(--text-lg);
		color: var(--text-primary);
	}
	.modal-body {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 1fr 280px;
	}
	.preview-pane {
		overflow-y: auto;
		padding: var(--space-6) var(--space-8);
		border-right: 1px solid var(--border-subtle);
	}
	.log-pane {
		overflow-y: auto;
		padding: var(--space-5);
		background: var(--surface-page);
	}
	.log {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.log li {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		line-height: 1.5;
	}
	.log.mini {
		margin-top: var(--space-2);
	}
	.log .mono {
		color: var(--text-brand);
		margin-right: var(--space-2);
	}
	.modal-foot {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-6);
		border-top: 1px solid var(--border-default);
	}
	.modal-foot .spacer {
		flex: 1;
	}
	.pos {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}
	.pos select {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-page);
		color: var(--text-primary);
	}

	.es {
		height: calc(100vh - 56px);
		display: flex;
		flex-direction: column;
		background: var(--surface-page);
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-6);
		background: var(--surface-elevated);
		border-bottom: 1px solid var(--border-default);
		flex-wrap: wrap;
	}
	.bar-left,
	.bar-right {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.title-input {
		font-size: var(--text-lg);
		font-weight: 700;
		padding: var(--space-1) var(--space-2);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-primary);
		min-width: 220px;
	}
	.title-input:hover {
		border-color: var(--border-default);
	}
	.title-input:focus {
		outline: none;
		border-color: var(--brand-500);
		background: var(--surface-page);
	}
	.dwell {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.dwell input {
		width: 64px;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-page);
		color: var(--text-primary);
	}
	.ingest {
		padding: var(--space-3) var(--space-6);
		background: var(--brand-50);
		border-bottom: 1px solid var(--brand-200);
	}
	.ingest.err {
		background: var(--error-bg);
		border-color: var(--error);
	}
	.ingest-top {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-sm);
		color: var(--text-brand);
		margin-bottom: var(--space-2);
	}
	.ingest.err .ingest-top {
		color: var(--error);
	}
	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
	}
	.track {
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--surface-subtle);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--brand-500);
		border-radius: var(--radius-full);
		transition: width var(--transition-moderate);
	}
	.fill.pulse {
		animation: pulse 1.2s ease-in-out infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.55; }
	}
	.content {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-10) var(--space-12) var(--space-24);
		max-width: 820px;
		width: 100%;
		margin: 0 auto;
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
		margin: 0 0 var(--space-4);
	}
	.eyebrow .dot {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--brand-500);
	}
	.eb {
		position: relative;
		border: 1px dashed transparent;
		border-radius: var(--radius-lg);
		padding: var(--space-2);
		margin: 0 calc(-1 * var(--space-2));
		transition: var(--transition-fast);
	}
	.eb:hover {
		border-color: var(--border-default);
		background: var(--surface-elevated);
	}
	.eb.editing {
		border-style: solid;
		border-color: var(--border-default);
		background: var(--surface-elevated);
	}
	.eb-ctrl {
		position: absolute;
		top: var(--space-1);
		right: var(--space-1);
		display: none;
		align-items: center;
		gap: var(--space-1);
		background: var(--surface-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		padding: 2px;
		box-shadow: var(--shadow-sm);
	}
	.eb:hover .eb-ctrl {
		display: flex;
	}
	.quiz-ph {
		padding: var(--space-4);
		border: 1px dashed var(--brand-200);
		border-radius: var(--radius-lg);
		background: var(--brand-50);
		color: var(--text-brand);
		font-size: var(--text-sm);
	}
	.badge {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		color: var(--text-brand);
		background: var(--brand-50);
		border: 1px solid var(--brand-200);
		border-radius: var(--radius-sm);
		padding: 1px var(--space-1);
	}
	.ic {
		width: 26px;
		height: 26px;
		border: none;
		background: transparent;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		cursor: pointer;
	}
	.ic:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.ic.danger:hover:not(:disabled) {
		color: var(--error);
	}
	.ic:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.insert-line {
		width: 100%;
		margin: var(--space-1) 0;
		padding: var(--space-1);
		border: 1px dashed var(--border-default);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-tertiary);
		font-size: var(--text-xs);
		cursor: pointer;
		opacity: 0;
		transition: var(--transition-fast);
	}
	.eb:hover > .insert-line,
	.insert-line.end,
	.insert-line:focus {
		opacity: 1;
	}
	.insert-line:hover {
		border-color: var(--brand-500);
		color: var(--text-brand);
	}
	.insert-form {
		margin: var(--space-2) 0;
	}
	.qbank {
		margin-top: var(--space-10);
		padding-top: var(--space-6);
		border-top: 1px solid var(--border-default);
	}
	.qbank-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.qbank-head h3 {
		margin: 0;
		font-size: var(--text-lg);
		color: var(--text-primary);
	}
	.hint {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		margin: var(--space-1) 0 var(--space-3);
	}
	.qrow {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-2);
	}
	.qq {
		flex: 1;
		min-width: 0;
		font-size: var(--text-sm);
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.btn-sm {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		transition: var(--transition-fast);
	}
	.btn-sm.primary {
		border: none;
		background: var(--brand-500);
		color: var(--text-inverse);
	}
	.btn-sm.ghost {
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		color: var(--text-secondary);
	}
	.btn-sm.ghost:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.btn-sm.ghost.active {
		border-color: var(--brand-500);
		color: var(--text-brand);
	}
	.upload.busy {
		opacity: 0.6;
		cursor: progress;
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
