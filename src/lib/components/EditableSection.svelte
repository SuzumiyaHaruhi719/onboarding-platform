<script lang="ts">
	import { untrack } from 'svelte';
	import { fade, scale, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { goto, invalidateAll } from '$app/navigation';
	import BlockRenderer from '$lib/content/BlockRenderer.svelte';
	import BlockForm from '$lib/components/editor/BlockForm.svelte';
	import BlockMenu from '$lib/components/editor/BlockMenu.svelte';
	import LazyRichTextEditor from '$lib/components/editor/LazyRichTextEditor.svelte';
	import QuizForm from '$lib/components/editor/QuizForm.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { SectionView, Block, BlockInput, QuizInput, EditorQuiz } from '$lib/content/types';
	import type { ModuleWithSections } from '$lib/db/queries';

	let {
		section,
		quizzes,
		modules = []
	}: { section: SectionView; quizzes: EditorQuiz[]; modules?: ModuleWithSections[] } = $props();

	const JSON_HEADERS = { 'content-type': 'application/json' };
	const noop = (): void => {};

	type Pos = 'start' | 'end' | { afterId: string };

	let preview = $state(false);
	let busy = $state(false);

	// Section meta (snapshot, re-synced on section change) with autosave.
	let title = $state(untrack(() => section.title));
	let minDwellSec = $state(untrack(() => Math.round(section.requirements.minDwellMs / 1000)));
	let saveStatus = $state<'idle' | 'saving' | 'saved'>('idle');
	let lastId = untrack(() => section.id);

	let editingId = $state<string | null>(null);
	let menuAt = $state<string | null>(null); // 'end' | 'start' | blockId — which "+" opened the menu
	let pending = $state<{ at: Pos; type: BlockInput['type'] } | null>(null);
	let dragId = $state<string | null>(null);
	let overId = $state<string | null>(null);
	let insertTarget = $state<string>('end');
	let newModuleTitle = $state('');
	let newSectionTitle = $state('');
	let structureBusy = $state(false);

	let toast = $state<{ msg: string; undo?: () => void; actionLabel?: string } | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | null = null;
	let metaTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (section.id !== lastId) {
			lastId = section.id;
			title = section.title;
			minDwellSec = Math.round(section.requirements.minDwellMs / 1000);
			editingId = null;
			menuAt = null;
			pending = null;
			saveStatus = 'idle';
		}
	});

	const TYPE_LABEL: Record<string, string> = {
		richtext: '富文本',
		heading: '标题', paragraph: '正文', list: '列表', quote: '引用',
		callout: '提示', image: '图片', video: '视频', quiz: '题目'
	};
	const SIDE_TYPES: { type: BlockInput['type']; icon: string; label: string; desc: string }[] = [
		{ type: 'richtext', icon: 'file-text', label: '图文正文', desc: '插入一段独立富文本内容' },
		{ type: 'callout', icon: 'info', label: '重点提示', desc: '安全提醒、结论或注意事项' },
		{ type: 'image', icon: 'image', label: '图片说明', desc: '图片、替代文本和图注' },
		{ type: 'video', icon: 'video', label: '视频片段', desc: '上传视频或粘贴视频地址' },
		{ type: 'quiz', icon: 'circle-check', label: '检查题', desc: '学生通过后继续学习' }
	];
	const currentModule = $derived(modules.find((m) => m.sections.some((s) => s.id === section.id)) ?? modules[0]);
	const currentModuleTitle = $derived(currentModule?.title ?? '当前模块');
	const insertPosition = $derived(posFrom(insertTarget));

	async function refresh(): Promise<void> {
		await invalidateAll();
	}
	async function call(url: string, body: unknown, method = 'POST'): Promise<{ ok?: boolean; id?: string } | null> {
		return fetch(url, { method, headers: JSON_HEADERS, body: JSON.stringify(body) })
			.then((r) => r.json())
			.catch(() => null);
	}

	// ---- Autosave section meta ----
	function scheduleMetaSave(): void {
		saveStatus = 'saving';
		if (metaTimer) clearTimeout(metaTimer);
		metaTimer = setTimeout(saveMetaNow, 700);
	}
	async function saveMetaNow(): Promise<void> {
		await call(
			'/api/editor/section',
			{ id: section.id, title: title.trim() || '未命名章节', minDwellMs: Math.max(0, minDwellSec) * 1000 },
			'PATCH'
		);
		saveStatus = 'saved';
		await refresh();
	}

	// ---- Block create / edit / delete / reorder ----
	function posFrom(at: string): Pos {
		return at === 'end' || at === 'start' ? at : { afterId: at };
	}

	async function createBlock(input: BlockInput, at: Pos): Promise<void> {
		busy = true;
		try {
			const r = await call('/api/editor/blocks/insert', { sectionId: section.id, blocks: [input], position: at });
			if (r?.ok) {
				// Only dismiss the form on success — a rejected save keeps the user's draft.
				pending = null;
				menuAt = null;
				await refresh();
			}
		} finally {
			busy = false;
		}
	}

	async function updateBlock(id: string, input: BlockInput): Promise<void> {
		busy = true;
		try {
			const r = await call('/api/editor/block', { id, block: input }, 'PATCH');
			if (r?.ok) {
				editingId = null;
				await refresh();
			}
		} finally {
			busy = false;
		}
	}

	function showToast(msg: string, undo?: () => void, actionLabel = '撤销'): void {
		if (toastTimer) clearTimeout(toastTimer);
		toast = { msg, undo, actionLabel };
		toastTimer = setTimeout(() => (toast = null), 6000);
	}

	async function deleteBlock(block: Block, index: number): Promise<void> {
		const { id: _omit, ...rest } = block;
		const snapshot = rest as BlockInput;
		busy = true;
		try {
			await call('/api/editor/block', { id: block.id }, 'DELETE');
			await refresh();
			showToast('已删除内容块', async () => {
				const prev = section.blocks[index - 1];
				const at: Pos = index <= 0 ? 'start' : prev ? { afterId: prev.id } : 'end';
				await createBlock(snapshot, at);
				toast = null;
			});
		} finally {
			busy = false;
		}
	}

	async function reorderTo(targetId: string): Promise<void> {
		if (!dragId || dragId === targetId) {
			dragId = null;
			overId = null;
			return;
		}
		const ids = section.blocks.map((b) => b.id);
		const from = ids.indexOf(dragId);
		const to = ids.indexOf(targetId);
		dragId = null;
		overId = null;
		if (from < 0 || to < 0) return;
		const [moved] = ids.splice(from, 1);
		ids.splice(to, 0, moved!);
		busy = true;
		try {
			await call('/api/editor/block/reorder', { orderedIds: ids });
			await refresh();
		} finally {
			busy = false;
		}
	}

	function pickType(at: string, type: BlockInput['type']): void {
		menuAt = null;
		pending = { at: posFrom(at), type };
	}
	function pickSideType(type: BlockInput['type']): void {
		menuAt = null;
		pending = { at: insertPosition, type };
	}
	function clearTransientEditingState(): void {
		pending = null;
		menuAt = null;
		editingId = null;
		insertTarget = 'end';
	}

	async function createSectionInCurrentModule(): Promise<void> {
		clearTransientEditingState();
		const moduleId = currentModule?.id;
		if (!moduleId) {
			showToast('请先创建模块');
			return;
		}
		const text = newSectionTitle.trim();
		if (!text) {
			showToast('请输入章节名称');
			return;
		}
		structureBusy = true;
		try {
			const created = await call('/api/editor/section', { moduleId, title: text });
			if (created?.ok && created.id) {
				newSectionTitle = '';
				await goto(`/learn/${created.id}`, { invalidateAll: true });
			}
		} finally {
			structureBusy = false;
		}
	}

	async function createModuleWithFirstSection(): Promise<void> {
		clearTransientEditingState();
		const text = newModuleTitle.trim();
		if (!text) {
			showToast('请输入模块名称');
			return;
		}
		structureBusy = true;
		try {
			const createdModule = await call('/api/editor/module', { title: text });
			if (!createdModule?.ok || !createdModule.id) return;
			const createdSection = await call('/api/editor/section', { moduleId: createdModule.id, title: '开始学习' });
			newModuleTitle = '';
			if (createdSection?.ok && createdSection.id) {
				await goto(`/learn/${createdSection.id}`, { invalidateAll: true });
			} else {
				await refresh();
				showToast('模块已创建，请在左侧继续添加章节');
			}
		} finally {
			structureBusy = false;
		}
	}

	// ---- Quizzes (authored inline as their own blocks) ----
	const quizById = $derived(new Map(quizzes.map((q) => [q.id, q])));
	const QUIZ_TYPE_LABEL: Record<string, string> = { single: '单选', multiple: '多选', boolean: '判断' };
	function isCorrectOption(q: EditorQuiz, i: number): boolean {
		if (q.type === 'single') return q.answer === i;
		if (q.type === 'multiple') return Array.isArray(q.answer) && q.answer.includes(i);
		return q.answer === (i === 0); // boolean: option 0 == "true"
	}

	/** Author a quiz inline → creates the quiz + its block at the position. */
	async function createQuizBlock(quiz: QuizInput, at: Pos): Promise<void> {
		busy = true;
		try {
			const r = await call('/api/editor/quiz', { sectionId: section.id, quiz, position: at });
			if (r?.ok) {
				pending = null;
				menuAt = null;
				await refresh();
			}
		} finally {
			busy = false;
		}
	}
	async function updateQuizById(id: string, quiz: QuizInput): Promise<void> {
		busy = true;
		try {
			const r = await call('/api/editor/quiz', { id, quiz }, 'PATCH');
			if (r?.ok) {
				editingId = null;
				await refresh();
			}
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
		else showToast(`上传失败:${r?.error ?? '请检查视频文件后重试'}`);
	}

	// ---- AI ingestion → preview → choose insertion ----
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
	let showLog = $state(false);
	let previewBlocks = $state<BlockInput[]>([]);
	let showPreview = $state(false);
	let insertPos = $state<string>('end');
	let inserting = $state(false);
	let timer: ReturnType<typeof setInterval> | null = null;

	const STAGE_LABEL: Record<string, string> = {
		pending: '准备中', extracting: '提取文本', converting: 'AI 转译中', ready: '转译完成', error: '失败'
	};
	const STAGE_PCT: Record<string, number> = { pending: 8, extracting: 35, converting: 75, ready: 100, error: 100 };
	const ingestPct = $derived(STAGE_PCT[ingestStage] ?? 0);
	const previewRender = $derived(previewBlocks.map((b, i) => ({ ...b, id: `pv-${i}` }) as Block));
	const hasBlocks = $derived(section.blocks.length > 0);

	function blockPlainText(block: Block): string {
		if (block.type === 'richtext') return block.markdown;
		if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote') return block.text;
		if (block.type === 'list') return block.items.join('\n');
		if (block.type === 'callout') return `${block.title}\n${block.body}`;
		return '';
	}

	function isExtractorNoiseBlock(block: Block): boolean {
		const text = blockPlainText(block).trim();
		if (!text) return false;
		if (/^-{3,}$/.test(text)) return true;
		return /^---\s*title\b[\s\S]*\b(created|modified|language|islinearized)\b/i.test(text);
	}

	function escapeMd(text: string): string {
		return text.replace(/\\/g, '\\\\').replace(/\*/g, '\\*').replace(/_/g, '\\_');
	}

	function blockToMarkdown(block: Block): string {
		switch (block.type) {
			case 'richtext':
				return block.markdown;
			case 'heading':
				return `${block.level === 2 ? '##' : '###'} ${block.text}`;
			case 'paragraph':
				return block.text;
			case 'list':
				return block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : '-'} ${item}`).join('\n');
			case 'quote':
				return `> ${block.text}${block.cite ? `\n>\n> - ${block.cite}` : ''}`;
			case 'callout':
				return `> **${escapeMd(block.title)}**${block.body ? `\n>\n> ${block.body}` : ''}`;
			default:
				return '';
		}
	}

	function isDocumentBlock(block: Block): boolean {
		return ['richtext', 'heading', 'paragraph', 'list', 'quote', 'callout'].includes(block.type);
	}

	const documentMarkdown = $derived(
		section.blocks
			.filter((block) => !isExtractorNoiseBlock(block))
			.map((block) => blockToMarkdown(block))
			.filter((part) => part.trim())
			.join('\n\n')
	);
	const documentEditorKey = $derived(
		`${section.id}:${section.blocks.filter(isDocumentBlock).map((block) => block.id).join('|')}`
	);

	async function replaceDocumentContent(markdown: string): Promise<void> {
		const md = markdown.trim();
		if (!md) {
			showToast('文档不能为空');
			return;
		}
		busy = true;
		try {
			for (const block of section.blocks) {
				if (block.type === 'image' || block.type === 'video' || block.type === 'quiz') continue;
				await call('/api/editor/block', { id: block.id }, 'DELETE');
			}
			await call('/api/editor/blocks/insert', {
				sectionId: section.id,
				blocks: [{ type: 'richtext', markdown: md }],
				position: 'start'
			});
			await refresh();
			showToast('整篇文档已保存');
		} finally {
			busy = false;
		}
	}

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
			await call('/api/editor/blocks/insert', { sectionId: section.id, blocks: previewBlocks, position: posFrom(insertPos) });
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
		if (e.key === 'Escape') {
			if (showPreview && !inserting) cancelPreview();
			else if (menuAt) menuAt = null;
			else if (pending) pending = null;
		}
	}

	$effect(() => () => {
		stopTimer();
		if (toastTimer) clearTimeout(toastTimer);
		if (metaTimer) clearTimeout(metaTimer);
	});
</script>

<svelte:window onkeydown={onKey} />

<div class="es">
	<div class="bar">
		<div class="bar-left">
			<button class="mode-pill" class:preview onclick={() => (preview = !preview)}>
				<span class="dot" class:on={!preview}></span>
				{preview ? '学员预览' : '编辑模式'}
			</button>
			<input class="title-input" bind:value={title} oninput={scheduleMetaSave} aria-label="章节标题" />
			<label class="dwell">最短阅读
				<input type="number" min="0" bind:value={minDwellSec} oninput={scheduleMetaSave} /> 秒
			</label>
			<span class="save-status" class:saving={saveStatus === 'saving'}>
				{#if saveStatus === 'saving'}保存中…{:else if saveStatus === 'saved'}已保存 <Icon name="check" size={13} stroke={2.5} />{/if}
			</span>
		</div>
		<div class="bar-right">
			<a class="btn-sm ghost preview-link" href={`/learn/${section.id}?view=learner`}>
				<Icon name="graduation-cap" size={15} /> 真实学生视图
			</a>
			<label class="btn-sm ghost upload ai-upload" class:busy={ingestBusy}>
				{#if ingestBusy}AI 转译中…{:else}<Icon name="sparkles" size={15} /> AI 转译文件{/if}
				<input type="file" accept=".txt,.md,.markdown,.docx,.pdf,.pptx" hidden onchange={onIngestFile} disabled={ingestBusy} />
			</label>
			<label class="btn-sm ghost upload video-upload" class:busy={uploading}>
				{#if uploading}上传中…{:else}<Icon name="video" size={15} /> 上传视频{/if}
				<input type="file" accept="video/*" hidden onchange={onVideoFile} disabled={uploading} />
			</label>
		</div>
	</div>

	{#if ingestBusy || ingestStage === 'error'}
		<div class="ingest" class:err={ingestStage === 'error'}>
			<div class="ingest-top">
				<span>{ingestStatus}</span>
				<span class="right">
					<span class="mono">{ingestElapsed}s{ingestTokens ? ` · ${ingestTokens} tok` : ''}</span>
					{#if ingestEvents.length}
						<button class="link" onclick={() => (showLog = !showLog)}>{showLog ? '隐藏详情' : '查看详情'}</button>
					{/if}
				</span>
			</div>
			{#if ingestBusy}
				<div class="track">
					{#if ingestStage === 'converting'}
						<!-- AI call is long & open-ended: indeterminate sweep reads as "working" -->
						<div class="fill indeterminate"></div>
					{:else}
						<div class="fill" style="width:{ingestPct}%"></div>
					{/if}
				</div>
			{/if}
			{#if showLog && ingestEvents.length}
				<ul class="log">
					{#each ingestEvents as ev, evi (evi)}<li><span class="mono">+{(ev.t / 1000).toFixed(1)}s</span> {ev.msg}</li>{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<div class="canvas" class:editing={!preview}>
		<article class="content">
			<p class="eyebrow"><span class="dot"></span>{section.title || '未命名章节'}</p>

			{#if preview}
				{#each section.blocks as block (block.id)}
					{#if !isExtractorNoiseBlock(block)}
						<BlockRenderer {block} quizzes={section.quizzes} sectionId={section.id} onintervals={noop} onpassed={noop} />
					{/if}
				{/each}
				{#if section.blocks.length === 0}<p class="muted">本节暂无内容。</p>{/if}
			{:else}
				<div class="word-shell">
					{#key documentEditorKey}
						<LazyRichTextEditor
							initial={documentMarkdown}
							onsave={replaceDocumentContent}
							oncancel={() => showToast('继续编辑中，未做更改')}
						/>
					{/key}
				</div>

				{#if section.blocks.length === 0 && !pending}
					<div class="empty">
						<div class="empty-icon"><Icon name="square-pen" size={24} /></div>
						<h3>开始创建本节内容</h3>
						<p>添加标题、正文、列表、视频或题目;也可以上传文档让 AI 转译成章节。</p>
						<div class="empty-actions">
							<div class="menu-anchor">
								<button class="btn primary" onclick={() => (menuAt = menuAt === 'start' ? null : 'start')}><Icon name="plus" size={16} /> 添加内容块</button>
								{#if menuAt === 'start'}
									<BlockMenu onpick={(t) => pickType('start', t)} onclose={() => (menuAt = null)} />
								{/if}
							</div>
							<label class="btn ghost upload" class:busy={ingestBusy}>
								<Icon name="sparkles" size={16} /> AI 转译文件
								<input type="file" accept=".txt,.md,.markdown,.docx,.pdf,.pptx" hidden onchange={onIngestFile} disabled={ingestBusy} />
							</label>
						</div>
					</div>
				{/if}

				{#if pending && (pending.at === 'start' || section.blocks.length === 0)}
					<div class="inserting">
						{#if pending.type === 'richtext'}
							<LazyRichTextEditor onsave={(md) => { if (pending) createBlock({ type: 'richtext', markdown: md }, pending.at); }} oncancel={() => (pending = null)} />
						{:else if pending.type === 'quiz'}
							<QuizForm onsave={(quiz) => { if (pending) createQuizBlock(quiz, pending.at); }} oncancel={() => (pending = null)} />
						{:else}
							<BlockForm presetType={pending?.type} onsave={(b) => { if (pending) createBlock(b, pending.at); }} oncancel={() => (pending = null)} />
						{/if}
					</div>
				{/if}

				{#each section.blocks as block, i (block.id)}
					<div
						class="eb"
						class:document-hidden={isDocumentBlock(block)}
						class:dragover={overId === block.id}
						class:dragging={dragId === block.id}
						ondragover={(e) => { e.preventDefault(); overId = block.id; }}
						ondrop={(e) => { e.preventDefault(); reorderTo(block.id); }}
						ondragleave={() => { if (overId === block.id) overId = null; }}
						role="listitem"
					>
						<div class="gutter left">
							<div class="menu-anchor">
								<button class="g-btn add" title="在此后添加" aria-label="在此处下方添加内容块" onclick={() => (menuAt = menuAt === block.id ? null : block.id)}><Icon name="plus" size={16} /></button>
								{#if menuAt === block.id}
									<BlockMenu onpick={(t) => pickType(block.id, t)} onclose={() => (menuAt = null)} />
								{/if}
							</div>
							<button
								class="g-btn handle"
								title="拖动排序"
								draggable="true"
								ondragstart={(e) => { dragId = block.id; e.dataTransfer?.setData('text/plain', block.id); }}
								ondragend={() => { dragId = null; overId = null; }}
								aria-label="拖动排序"
							>⠿</button>
						</div>

						<div class="block-body">
							{#if editingId === block.id}
								{#if block.type === 'richtext'}
									<LazyRichTextEditor initial={block.markdown} onsave={(md) => updateBlock(block.id, { type: 'richtext', markdown: md })} oncancel={() => (editingId = null)} />
								{:else if block.type === 'quiz'}
									{@const q = quizById.get(block.quizId)}
									{#if q}
										<QuizForm initial={q} onsave={(quiz) => updateQuizById(block.quizId, quiz)} oncancel={() => (editingId = null)} />
									{/if}
								{:else}
									<BlockForm initial={block as Block} onsave={(b) => updateBlock(block.id, b)} oncancel={() => (editingId = null)} />
								{/if}
							{:else if block.type === 'quiz'}
								{@const q = quizById.get(block.quizId)}
								{#if q}
									<div class="quiz-card">
										<div class="qc-head">
											<span class="q-badge">{QUIZ_TYPE_LABEL[q.type]}</span>
											<p class="qc-q">{q.question}</p>
										</div>
										<ul class="qc-opts">
											{#each q.options as opt, oi (oi)}
												<li class:correct={isCorrectOption(q, oi)}>
													<span class="qc-mark">{#if isCorrectOption(q, oi)}<Icon name="check" size={13} stroke={3} />{/if}</span>
													<span>{opt}</span>
												</li>
											{/each}
										</ul>
									</div>
								{:else}
									<div class="quiz-ph"><Icon name="file-text" size={16} />题目数据缺失</div>
								{/if}
							{:else}
								<BlockRenderer {block} quizzes={[]} sectionId={section.id} onintervals={noop} onpassed={noop} />
							{/if}
						</div>

						<div class="gutter right">
							<span class="badge">{TYPE_LABEL[block.type]}</span>
							<button class="block-action" title="编辑" aria-label="编辑内容块" onclick={() => (editingId = editingId === block.id ? null : block.id)}><Icon name="pencil" size={15} /> 编辑</button>
							<button class="block-action danger" title="删除" aria-label="删除内容块" onclick={() => deleteBlock(block as Block, i)} disabled={busy}><Icon name="trash-2" size={15} /> 删除</button>
						</div>

						{#if pending && typeof pending.at === 'object' && pending.at.afterId === block.id}
							<div class="inserting after">
								{#if pending.type === 'richtext'}
									<LazyRichTextEditor onsave={(md) => { if (pending) createBlock({ type: 'richtext', markdown: md }, pending.at); }} oncancel={() => (pending = null)} />
								{:else if pending.type === 'quiz'}
									<QuizForm onsave={(quiz) => { if (pending) createQuizBlock(quiz, pending.at); }} oncancel={() => (pending = null)} />
								{:else}
									<BlockForm presetType={pending?.type} onsave={(b) => { if (pending) createBlock(b, pending.at); }} oncancel={() => (pending = null)} />
								{/if}
							</div>
						{/if}
					</div>
				{/each}

				{#if section.blocks.length > 0}
					<div class="add-end menu-anchor">
						<button class="add-end-btn" onclick={() => (menuAt = menuAt === 'end' ? null : 'end')}><Icon name="plus" size={16} /> 添加内容块</button>
						{#if menuAt === 'end'}
							<BlockMenu onpick={(t) => pickType('end', t)} onclose={() => (menuAt = null)} />
						{/if}
						{#if pending && pending.at === 'end'}
							<div class="inserting">
								{#if pending.type === 'richtext'}
									<LazyRichTextEditor onsave={(md) => createBlock({ type: 'richtext', markdown: md }, 'end')} oncancel={() => (pending = null)} />
								{:else if pending.type === 'quiz'}
									<QuizForm onsave={(quiz) => createQuizBlock(quiz, 'end')} oncancel={() => (pending = null)} />
								{:else}
									<BlockForm presetType={pending.type} onsave={(b) => createBlock(b, 'end')} oncancel={() => (pending = null)} />
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			{/if}
		</article>

		{#if !preview}
			<aside class="sidepanel" aria-label="创建与插入">
				<section class="panel-card hero-panel">
					<div class="panel-kicker"><Icon name="panel-right" size={15} /> 编辑工作台</div>
					<h2>创建与插入</h2>
					<p>正文像文档一样编辑；章节、模块和结构化内容都从这里添加。</p>
				</section>

				<section class="panel-card">
					<div class="panel-head">
						<span class="panel-index">01</span>
						<div>
							<h3>课程结构</h3>
							<p>当前模块：{currentModuleTitle}</p>
						</div>
					</div>
					<label class="field">
						<span>新章节</span>
						<div class="inline-create">
							<input bind:value={newSectionTitle} placeholder="例如：安全合规测验" onkeydown={(e) => { if (e.key === 'Enter') createSectionInCurrentModule(); }} />
							<button class="icon-action primary" aria-label="创建新章节" title="创建新章节" onclick={createSectionInCurrentModule} disabled={structureBusy}><Icon name="plus" size={16} /></button>
						</div>
					</label>
					<label class="field">
						<span>新模块</span>
						<div class="inline-create">
							<input bind:value={newModuleTitle} placeholder="例如：XJMK" onkeydown={(e) => { if (e.key === 'Enter') createModuleWithFirstSection(); }} />
							<button class="icon-action" aria-label="创建新模块" title="创建新模块" onclick={createModuleWithFirstSection} disabled={structureBusy}><Icon name="layers" size={16} /></button>
						</div>
					</label>
				</section>

				<section class="panel-card">
					<div class="panel-head">
						<span class="panel-index">02</span>
						<div>
							<h3>插入模块</h3>
							<p>{section.blocks.length} 个内容块，可选择插入位置</p>
						</div>
					</div>
					<label class="field">
						<span>插入位置</span>
						<select bind:value={insertTarget}>
							<option value="start">章节开头</option>
							{#each section.blocks as b, i (b.id)}
								<option value={b.id}>第 {i + 1} 块之后 · {TYPE_LABEL[b.type]}</option>
							{/each}
							<option value="end">章节末尾</option>
						</select>
					</label>
					<div class="module-grid">
						{#each SIDE_TYPES as t (t.type)}
							<button class="module-tile" class:active={pending?.type === t.type} onclick={() => pickSideType(t.type)}>
								<span class="tile-icon"><Icon name={t.icon} size={18} /></span>
								<span>
									<strong>{t.label}</strong>
									<small>{t.desc}</small>
								</span>
							</button>
						{/each}
					</div>
				</section>

				{#if pending}
					<section class="panel-card side-form">
						<div class="panel-head">
							<span class="panel-index">03</span>
							<div>
								<h3>{TYPE_LABEL[pending.type]}设置</h3>
								<p>保存后插入到所选位置</p>
							</div>
						</div>
						{#if pending.type === 'richtext'}
							<LazyRichTextEditor onsave={(md) => { if (pending) createBlock({ type: 'richtext', markdown: md }, pending.at); }} oncancel={() => (pending = null)} />
						{:else if pending.type === 'quiz'}
							<QuizForm onsave={(quiz) => { if (pending) createQuizBlock(quiz, pending.at); }} oncancel={() => (pending = null)} />
						{:else}
							<BlockForm presetType={pending.type} lockType onsave={(b) => { if (pending) createBlock(b, pending.at); }} oncancel={() => (pending = null)} />
						{/if}
					</section>
				{:else}
					<section class="panel-card quick-panel">
						<div class="panel-head">
							<span class="panel-index">03</span>
							<div>
								<h3>导入素材</h3>
								<p>AI 转译或视频上传后会进入当前章节</p>
							</div>
						</div>
						<label class="wide-action" class:busy={ingestBusy}>
							<Icon name="sparkles" size={16} /> {ingestBusy ? 'AI 转译中…' : 'AI 转译 PDF / PPTX / Word'}
							<input type="file" accept=".txt,.md,.markdown,.docx,.pdf,.pptx" hidden onchange={onIngestFile} disabled={ingestBusy} />
						</label>
						<label class="wide-action" class:busy={uploading}>
							<Icon name="video" size={16} /> {uploading ? '上传中…' : '上传视频'}
							<input type="file" accept="video/*" hidden onchange={onVideoFile} disabled={uploading} />
						</label>
					</section>
				{/if}
			</aside>
		{/if}
	</div>

	{#if toast}
		<div class="toast" transition:fly={{ y: 16, duration: 260, easing: cubicOut }}>
			<span>{toast.msg}</span>
			{#if toast.undo}<button onclick={() => toast?.undo?.()}>{toast.actionLabel}</button>{/if}
		</div>
	{/if}
</div>

{#if showPreview}
	<div class="modal-bg" transition:fade={{ duration: 200 }}><div class="modal" role="dialog" aria-modal="true" aria-label="AI 转译预览" tabindex="-1" in:scale={{ start: 0.96, opacity: 0, duration: 320, easing: cubicOut }} out:scale={{ start: 0.98, opacity: 0, duration: 180 }}>
		<header class="modal-head">
			<strong>AI 转译预览 · {previewBlocks.length} 块</strong>
			<span class="badge">{ingestUsedAgent ? `qwen3.7-plus · ${ingestTokens} tokens` : '本地解析'}</span>
		</header>
		<div class="modal-body">
			<div class="preview-pane">
				{#if previewRender.length === 0}<p class="hint">没有可用内容。</p>{/if}
				{#each previewRender as block (block.id)}
					{#if block.type === 'quiz'}<div class="quiz-ph"><Icon name="file-text" size={16} />题目区</div>
					{:else}<BlockRenderer {block} quizzes={[]} sectionId={section.id} onintervals={noop} onpassed={noop} />{/if}
				{/each}
			</div>
			<aside class="log-pane">
				<div class="rail-label">事件日志</div>
				<ul class="log">{#each ingestEvents as ev, evi (evi)}<li><span class="mono">+{(ev.t / 1000).toFixed(1)}s</span> {ev.msg}</li>{/each}</ul>
			</aside>
		</div>
		<footer class="modal-foot">
			<label class="pos">插入位置
				<select bind:value={insertPos}>
					<option value="start">章节开头</option>
					{#each section.blocks as b, i (b.id)}<option value={b.id}>第 {i + 1} 块之后 · {TYPE_LABEL[b.type]}</option>{/each}
					<option value="end">章节末尾</option>
				</select>
			</label>
			<div class="spacer"></div>
			<button class="btn-sm ghost" onclick={cancelPreview} disabled={inserting}>取消</button>
			<button class="btn-sm primary" onclick={confirmInsert} disabled={inserting}>{inserting ? '插入中…' : `确认插入(${previewBlocks.length} 块)`}</button>
		</footer>
	</div></div>
{/if}

<style>
	.es {
		height: calc(100vh - 56px);
		display: flex;
		flex-direction: column;
		background: var(--surface-page);
		position: relative;
	}
	.bar {
		position: sticky;
		top: 56px;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-6);
		background:
			linear-gradient(90deg, var(--brand-50), transparent 32%),
			linear-gradient(135deg, var(--accent-blue-bg), transparent 58%),
			var(--surface-elevated);
		border-bottom: 1px solid var(--border-default);
		flex-wrap: wrap;
	}
	.bar-left,
	.bar-right {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.mode-pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--brand-500);
		border-radius: var(--radius-full);
		background: var(--brand-50);
		color: var(--text-brand);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}
	.mode-pill.preview {
		border-color: var(--border-default);
		background: var(--surface-subtle);
		color: var(--text-secondary);
	}
	.mode-pill .dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--text-disabled);
	}
	.mode-pill .dot.on {
		background: var(--brand-500);
	}
	.title-input {
		font-size: var(--text-lg);
		font-weight: 700;
		padding: var(--space-1) var(--space-2);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-primary);
		min-width: 200px;
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
		width: 60px;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-page);
		color: var(--text-primary);
	}
	.save-status {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-xs);
		color: var(--success);
		min-width: 56px;
	}
	.save-status.saving {
		color: var(--text-tertiary);
	}

	.ingest {
		padding: var(--space-3) var(--space-6);
		background:
			linear-gradient(90deg, var(--accent-violet-bg), var(--accent-blue-bg)),
			var(--surface-elevated);
		border-bottom: 1px solid color-mix(in srgb, var(--accent-violet) 36%, var(--border-subtle));
	}
	.ingest.err {
		background: var(--error-bg);
		border-color: var(--error);
	}
	.ingest-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: var(--text-sm);
		color: var(--accent-violet);
		margin-bottom: var(--space-2);
	}
	.ingest.err .ingest-top {
		color: var(--error);
	}
	.ingest-top .right {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.link {
		border: none;
		background: transparent;
		color: var(--text-brand);
		cursor: pointer;
		font-size: var(--text-xs);
		text-decoration: underline;
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
		background: linear-gradient(90deg, var(--accent-violet), var(--accent-blue), var(--brand-500));
		border-radius: var(--radius-full);
		transition: width var(--transition-moderate);
	}
	.fill.indeterminate {
		width: 40%;
		will-change: transform;
		animation: indet 1.3s var(--ease-out) infinite;
	}
	@keyframes indet {
		0% { transform: translateX(-115%); }
		100% { transform: translateX(315%); }
	}
	@media (prefers-reduced-motion: reduce) {
		.fill.indeterminate {
			animation: none;
			width: 100%;
			opacity: 0.6;
		}
	}

	.canvas {
		flex: 1;
		overflow-y: auto;
	}
	.canvas.editing {
		display: grid;
		grid-template-columns: minmax(620px, 1fr) 360px;
		align-items: start;
		gap: var(--space-6);
		padding: var(--space-8) var(--space-6) var(--space-24);
	}
	.content {
		max-width: 1040px;
		width: 100%;
		margin: 0 auto;
		padding: var(--space-10) var(--space-8) var(--space-24);
	}
	.canvas.editing .content {
		max-width: none;
		padding: 0;
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
	.muted {
		color: var(--text-tertiary);
	}
	.word-shell {
		margin-top: var(--space-4);
	}
	.word-shell ~ .empty,
	.word-shell ~ .inserting,
	.word-shell ~ .add-end {
		display: none;
	}
	.sidepanel {
		position: sticky;
		top: 132px;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		max-height: calc(100vh - 156px);
		overflow-y: auto;
		padding-right: 2px;
	}
	.panel-card {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.64), rgba(255, 255, 255, 0)),
			var(--surface-elevated);
		box-shadow: var(--shadow-sm);
		padding: var(--space-4);
	}
	:global(:root[data-theme='dark']) .bar {
		background:
			linear-gradient(90deg, rgba(47, 212, 122, 0.075), transparent 28%),
			linear-gradient(135deg, var(--accent-blue-bg), transparent 60%),
			rgba(8, 10, 12, 0.94);
		box-shadow:
			inset 0 -1px 0 rgba(255, 255, 255, 0.035),
			0 16px 42px rgba(0, 0, 0, 0.2);
	}
	:global(:root[data-theme='dark']) .panel-card {
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.022), rgba(255, 255, 255, 0)),
			#0b0d10;
		border-color: rgba(255, 255, 255, 0.11);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.035),
			0 18px 42px rgba(0, 0, 0, 0.34);
	}
	:global(:root[data-theme='dark']) .hero-panel {
		background:
			linear-gradient(135deg, rgba(47, 212, 122, 0.08), var(--accent-blue-bg) 48%, rgba(255, 255, 255, 0.012)),
			#0a0c0e;
		border-color: color-mix(in srgb, var(--accent-blue) 30%, rgba(47, 212, 122, 0.28));
	}
	.hero-panel {
		background:
			linear-gradient(135deg, var(--brand-50), var(--accent-blue-bg) 50%, var(--surface-elevated) 78%);
		border-color: color-mix(in srgb, var(--accent-blue) 28%, var(--brand-200));
	}
	.panel-kicker {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-brand);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.panel-card h2,
	.panel-card h3,
	.panel-card p {
		margin: 0;
	}
	.panel-card h2 {
		margin-top: var(--space-2);
		font-size: var(--text-2xl);
		color: var(--text-primary);
		letter-spacing: 0;
	}
	.panel-card h3 {
		font-size: var(--text-base);
		color: var(--text-primary);
	}
	.panel-card p {
		margin-top: var(--space-1);
		color: var(--text-tertiary);
		font-size: var(--text-xs);
		line-height: 1.5;
	}
	.panel-head {
		display: grid;
		grid-template-columns: 38px minmax(0, 1fr);
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}
	.panel-index {
		width: 38px;
		height: 38px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-lg);
		background: var(--brand-50);
		border: 1px solid var(--brand-200);
		color: var(--text-brand);
		font-family: var(--font-mono);
		font-weight: 900;
	}
	.sidepanel > .panel-card:nth-child(2) .panel-index,
	.sidepanel > .panel-card:nth-child(2) .panel-kicker {
		color: var(--accent-amber);
	}
	.sidepanel > .panel-card:nth-child(2) .panel-index {
		background: var(--accent-amber-bg);
		border-color: color-mix(in srgb, var(--accent-amber) 42%, var(--border-default));
	}
	.sidepanel > .panel-card:nth-child(3) .panel-index,
	.sidepanel > .panel-card:nth-child(3) .panel-kicker {
		color: var(--accent-violet);
	}
	.sidepanel > .panel-card:nth-child(3) .panel-index {
		background: var(--accent-violet-bg);
		border-color: color-mix(in srgb, var(--accent-violet) 42%, var(--border-default));
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-top: var(--space-3);
	}
	.field > span {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		font-weight: 700;
	}
	.field input,
	.field select {
		width: 100%;
		min-height: 42px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-page);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--text-sm);
		padding: var(--space-2) var(--space-3);
	}
	.field input:focus,
	.field select:focus {
		outline: none;
		border-color: var(--brand-500);
		box-shadow: 0 0 0 3px var(--brand-200);
	}
	.inline-create {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 44px;
		gap: var(--space-2);
	}
	.icon-action {
		width: 44px;
		min-height: 42px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-elevated);
		color: var(--text-secondary);
		cursor: pointer;
		transition: var(--transition-fast);
	}
	.icon-action.primary {
		border-color: var(--brand-500);
		background: var(--brand-500);
		color: var(--text-inverse);
	}
	.icon-action:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: var(--shadow-sm);
	}
	.module-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.module-tile {
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr);
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		min-height: 66px;
		padding: var(--space-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background:
			linear-gradient(90deg, var(--tile-bg, transparent), transparent 56%),
			var(--surface-container);
		color: var(--text-primary);
		text-align: left;
		cursor: pointer;
		transition: var(--transition-fast);
	}
	.module-tile:nth-child(1) {
		--tile-accent: var(--accent-blue);
		--tile-bg: var(--accent-blue-bg);
	}
	.module-tile:nth-child(2) {
		--tile-accent: var(--accent-amber);
		--tile-bg: var(--accent-amber-bg);
	}
	.module-tile:nth-child(3) {
		--tile-accent: var(--accent-cyan);
		--tile-bg: var(--accent-cyan-bg);
	}
	.module-tile:nth-child(4) {
		--tile-accent: var(--accent-violet);
		--tile-bg: var(--accent-violet-bg);
	}
	.module-tile:nth-child(5) {
		--tile-accent: var(--accent-rose);
		--tile-bg: var(--accent-rose-bg);
	}
	:global(:root[data-theme='dark']) .module-tile {
		background:
			linear-gradient(90deg, var(--tile-bg, transparent), transparent 58%),
			#080a0c;
		border-color: color-mix(in srgb, var(--tile-accent, white) 18%, rgba(255, 255, 255, 0.08));
	}
	:global(:root[data-theme='dark']) .module-tile:hover,
	:global(:root[data-theme='dark']) .module-tile.active {
		background:
			linear-gradient(180deg, var(--tile-bg, rgba(47, 212, 122, 0.075)), rgba(255, 255, 255, 0.012)),
			#0b0e11;
		border-color: color-mix(in srgb, var(--tile-accent, var(--brand-500)) 42%, rgba(255, 255, 255, 0.14));
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
	}
	.module-tile:hover,
	.module-tile.active {
		border-color: var(--tile-accent, var(--brand-500));
		background:
			linear-gradient(90deg, var(--tile-bg, var(--brand-50)), transparent 60%),
			var(--surface-elevated);
	}
	.tile-icon {
		width: 40px;
		height: 40px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-lg);
		background: var(--surface-elevated);
		border: 1px solid var(--border-default);
		color: var(--tile-accent, var(--text-brand));
	}
	.module-tile strong,
	.module-tile small {
		display: block;
	}
	.module-tile strong {
		font-size: var(--text-sm);
	}
	.module-tile small {
		margin-top: 2px;
		color: var(--text-tertiary);
		font-size: var(--text-xs);
		line-height: 1.35;
	}
	.side-form {
		border-color: var(--brand-200);
	}
	.side-form :global(.rte) {
		box-shadow: none;
	}
	.side-form :global(.ribbon) {
		position: static;
		padding: var(--space-2);
	}
	.side-form :global(.group-label),
	.side-form :global(.statusbar) {
		display: none;
	}
	.side-form :global(.surface-shell) {
		padding: var(--space-2);
	}
	.side-form :global(.surface) {
		min-height: 220px;
		max-height: 360px;
		padding: var(--space-4);
	}
	.side-form :global(.ProseMirror) {
		min-height: 180px;
	}
	.wide-action {
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-container);
		color: var(--text-secondary);
		font-weight: 800;
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.wide-action:hover {
		border-color: var(--accent-blue);
		color: var(--accent-blue);
		background: var(--accent-blue-bg);
	}
	.wide-action.busy {
		opacity: 0.65;
		cursor: progress;
	}

	.empty {
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-2xl);
		padding: var(--space-12) var(--space-8);
		text-align: center;
		background: var(--surface-elevated);
	}
	.empty-icon {
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
		font-size: var(--text-xl);
	}
	.empty h3 {
		margin: 0 0 var(--space-2);
		color: var(--text-primary);
	}
	.empty p {
		margin: 0 0 var(--space-5);
		color: var(--text-tertiary);
		font-size: var(--text-sm);
	}
	.empty-actions {
		display: flex;
		gap: var(--space-3);
		justify-content: center;
	}
	.menu-anchor {
		position: relative;
		display: inline-block;
	}

	/* Block row with non-overlapping gutters */
	.eb {
		display: grid;
		grid-template-columns: 56px minmax(0, 1fr) 178px;
		align-items: start;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		background: var(--surface-elevated);
		box-shadow: var(--shadow-sm);
		transition: border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
	}
	.eb.document-hidden {
		display: none;
	}
	.eb:hover {
		border-color: var(--border-strong);
		box-shadow: var(--shadow-md);
	}
	.eb.dragover {
		border-color: var(--brand-500);
		transform: translateY(-1px);
	}
	.eb.dragging {
		opacity: 0.5;
	}
	.gutter {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 2px;
		opacity: 1;
		padding-top: var(--space-1);
	}
	.gutter.right {
		justify-content: flex-end;
		gap: var(--space-1);
	}
	.g-btn {
		width: 36px;
		height: 36px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: var(--text-sm);
	}
	.g-btn:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.g-btn.add {
		border-color: var(--brand-200);
		background: var(--brand-50);
		color: var(--text-brand);
	}
	.g-btn.handle {
		cursor: grab;
		font-size: 0;
	}
	.g-btn.handle::before {
		content: '⋮⋮';
		font-size: 14px;
		letter-spacing: -4px;
		transform: rotate(90deg);
	}
	.g-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.block-body {
		min-width: 0;
		padding: var(--space-1) 0;
	}
	.badge {
		align-self: center;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		color: var(--text-brand);
		background: var(--brand-50);
		border: 1px solid var(--brand-200);
		border-radius: var(--radius-sm);
		padding: 1px var(--space-1);
	}
	.block-action {
		min-height: 34px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-elevated);
		color: var(--text-secondary);
		font-size: var(--text-xs);
		font-weight: 800;
		white-space: nowrap;
		cursor: pointer;
		transition: var(--transition-fast);
	}
	.block-action:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.block-action.danger:hover:not(:disabled) {
		border-color: var(--error);
		background: var(--error-bg);
		color: var(--error);
	}
	.quiz-ph {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px dashed var(--brand-200);
		border-radius: var(--radius-lg);
		background: var(--brand-50);
		color: var(--text-brand);
		font-size: var(--text-sm);
	}
	.inserting {
		margin: var(--space-2) 0;
	}
	.inserting.after {
		grid-column: 1 / -1;
	}
	.add-end {
		display: block;
		margin-top: var(--space-3);
	}
	.add-end-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		width: 100%;
		padding: var(--space-3);
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-lg);
		background: transparent;
		color: var(--text-tertiary);
		font-size: var(--text-sm);
		cursor: pointer;
		transition: var(--transition-fast);
	}
	.add-end-btn:hover {
		border-color: var(--brand-500);
		color: var(--text-brand);
		background: var(--surface-hover);
	}

	.hint {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		margin: var(--space-1) 0 var(--space-3);
	}
	/* Editor preview of a quiz block: question + options with the answer marked. */
	.quiz-card {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-subtle);
		padding: var(--space-4);
	}
	.qc-head {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}
	.q-badge {
		flex: none;
		margin-top: 2px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-brand);
		background: var(--brand-50);
		border: 1px solid var(--brand-200);
		border-radius: var(--radius-sm);
		padding: 1px var(--space-2);
	}
	.qc-q {
		margin: 0;
		font-weight: 700;
		color: var(--text-primary);
	}
	.qc-opts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.qc-opts li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-tertiary);
	}
	.qc-opts li.correct {
		color: var(--text-brand);
		font-weight: 600;
	}
	.qc-mark {
		display: inline-flex;
		width: 16px;
		justify-content: center;
		color: var(--brand-500);
	}

	.btn,
	.btn-sm {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		border-radius: var(--radius-lg);
		font-weight: 600;
		cursor: pointer;
		transition: var(--transition-base);
	}
	.btn {
		padding: var(--space-2) var(--space-5);
		font-size: var(--text-sm);
	}
	.btn-sm {
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-sm);
		border-radius: var(--radius-md);
	}
	.primary {
		border: none;
		background: var(--brand-500);
		color: var(--text-inverse);
	}
	.primary:hover:not(:disabled) {
		background: var(--brand-600);
	}
	.ghost {
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		color: var(--text-secondary);
	}
	.ghost:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.preview-link {
		border-color: color-mix(in srgb, var(--accent-blue) 36%, var(--border-default));
		background: var(--accent-blue-bg);
		color: var(--accent-blue);
	}
	.ai-upload {
		border-color: color-mix(in srgb, var(--accent-violet) 36%, var(--border-default));
		background: var(--accent-violet-bg);
		color: var(--accent-violet);
	}
	.video-upload {
		border-color: color-mix(in srgb, var(--accent-cyan) 36%, var(--border-default));
		background: var(--accent-cyan-bg);
		color: var(--accent-cyan);
	}
	.upload {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.upload.busy {
		opacity: 0.6;
		cursor: progress;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.toast {
		position: absolute;
		bottom: var(--space-6);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-5);
		background: var(--surface-active);
		color: var(--text-primary);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		z-index: 80;
		font-size: var(--text-sm);
	}
	.toast button {
		border: none;
		background: transparent;
		color: var(--text-brand);
		font-weight: 700;
		cursor: pointer;
	}

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
	.rail-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
		margin-bottom: var(--space-3);
	}
	.log {
		list-style: none;
		margin: var(--space-2) 0 0;
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

	@media (max-width: 768px) {
		.es {
			height: auto;
			min-height: calc(100vh - 56px);
		}
		.canvas {
			overflow: visible;
		}
		.canvas.editing {
			display: flex;
			flex-direction: column;
			padding: var(--space-4);
			gap: var(--space-4);
		}
		.bar {
			align-items: stretch;
			padding: var(--space-3) var(--space-4);
		}
		.bar-left,
		.bar-right {
			width: 100%;
			flex-wrap: wrap;
		}
		.title-input {
			flex: 1 1 100%;
			min-width: 0;
		}
		.content {
			padding: var(--space-6) var(--space-4) var(--space-16);
		}
		.canvas.editing .content {
			padding: 0;
			order: 2;
		}
		.sidepanel {
			position: static;
			order: 1;
			max-height: none;
			overflow: visible;
			padding-right: 0;
		}
		.panel-card {
			padding: var(--space-3);
		}
		.module-grid {
			grid-template-columns: 1fr;
		}
		.eb {
			grid-template-columns: 1fr;
			gap: var(--space-1);
			padding: var(--space-3);
		}
		.gutter {
			opacity: 1;
		}
		.gutter.right {
			justify-content: flex-start;
			flex-wrap: wrap;
		}
		.badge {
			margin-right: auto;
		}
		.empty-actions,
		.modal-foot,
		.pos {
			flex-direction: column;
			align-items: stretch;
		}
		.modal-body {
			grid-template-columns: 1fr;
		}
		.preview-pane {
			border-right: none;
			border-bottom: 1px solid var(--border-subtle);
			padding: var(--space-4);
		}
	}
</style>
