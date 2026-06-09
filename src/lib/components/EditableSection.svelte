<script lang="ts">
	import { untrack } from 'svelte';
	import { fade, scale, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import type { Content, JSONContent } from '@tiptap/core';
	import { goto, invalidateAll } from '$app/navigation';
	import BlockRenderer from '$lib/content/BlockRenderer.svelte';
	import LazyRichTextEditor from '$lib/components/editor/LazyRichTextEditor.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useI18n } from '$lib/i18n/context';
	import type { SectionView, Block, BlockInput, EditorQuiz } from '$lib/content/types';
	import type { ModuleWithSections } from '$lib/db/queries';

	let {
		section,
		quizzes,
		modules = []
	}: { section: SectionView; quizzes: EditorQuiz[]; modules?: ModuleWithSections[] } = $props();

	const JSON_HEADERS = { 'content-type': 'application/json' };
	const noop = (): void => {};
	const i18n = useI18n();
	const tx = (zh: string, en: string): string => (i18n().lang === 'zh' ? zh : en);

	let preview = $state(false);
	let busy = $state(false);

	// Section meta (snapshot, re-synced on section change) with autosave.
	let title = $state(untrack(() => section.title));
	let minDwellSec = $state(untrack(() => Math.round(section.requirements.minDwellMs / 1000)));
	let saveStatus = $state<'idle' | 'saving' | 'saved'>('idle');
	let lastId = untrack(() => section.id);

	let newModuleTitle = $state('');
	let newSectionTitle = $state('');
	let structureBusy = $state(false);
	let documentInsertRequest = $state<{ id: number; content: Content } | null>(null);
	let documentInsertId = 0;

	let toast = $state<{ msg: string; undo?: () => void; actionLabel?: string } | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | null = null;
	let metaTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (section.id !== lastId) {
			lastId = section.id;
			title = section.title;
			minDwellSec = Math.round(section.requirements.minDwellMs / 1000);
			saveStatus = 'idle';
		}
	});

	const TYPE_LABEL: Record<string, () => string> = {
		richtext: () => tx('文档', 'Document'),
		heading: () => tx('标题', 'Heading'),
		paragraph: () => tx('正文', 'Paragraph'),
		list: () => tx('列表', 'List'),
		quote: () => tx('引用', 'Quote'),
		callout: () => tx('提示', 'Callout'),
		image: () => tx('图片', 'Image'),
		video: () => tx('视频', 'Video'),
		quiz: () => tx('题目', 'Quiz')
	};
	const typeLabel = (type: string): string => TYPE_LABEL[type]?.() ?? type;
	const currentModule = $derived(modules.find((m) => m.sections.some((s) => s.id === section.id)) ?? modules[0]);
	const currentModuleTitle = $derived(currentModule?.title ?? tx('当前模块', 'Current module'));

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
			{ id: section.id, title: title.trim() || tx('未命名章节', 'Untitled section'), minDwellMs: Math.max(0, minDwellSec) * 1000 },
			'PATCH'
		);
		saveStatus = 'saved';
		await refresh();
	}

	// ---- Document inserts ----
	function showToast(msg: string, undo?: () => void, actionLabel = tx('撤销', 'Undo')): void {
		if (toastTimer) clearTimeout(toastTimer);
		toast = { msg, undo, actionLabel };
		toastTimer = setTimeout(() => (toast = null), 6000);
	}
	const textContent = (text: string): JSONContent[] => (text ? [{ type: 'text', text }] : []);
	const paragraphNode = (text: string): JSONContent => ({ type: 'paragraph', content: textContent(text) });
	function documentInsertContent(type: BlockInput['type']): Content {
		switch (type) {
			case 'heading':
				return { type: 'heading', attrs: { level: 2 }, content: textContent(tx('新标题', 'New heading')) };
			case 'paragraph':
			case 'richtext':
				return paragraphNode(tx('在这里输入新段落。', 'Type the new paragraph here.'));
			case 'list':
				return {
					type: 'bulletList',
					content: [
						{ type: 'listItem', content: [paragraphNode(tx('第一项', 'First item'))] },
						{ type: 'listItem', content: [paragraphNode(tx('第二项', 'Second item'))] }
					]
				};
			case 'quote':
				return { type: 'blockquote', content: [paragraphNode(tx('引用内容', 'Quote text'))] };
			case 'callout':
				return {
					type: 'blockquote',
					content: [
						{
							type: 'paragraph',
							content: [{ type: 'text', text: tx('重点提示', 'Callout title'), marks: [{ type: 'bold' }] }]
						},
						paragraphNode(tx('在这里编辑提示内容。', 'Edit the callout body here.'))
					]
				};
			default:
				return paragraphNode(tx('新内容', 'New content'));
		}
	}
	function insertIntoDocument(type: BlockInput['type']): void {
		documentInsertRequest = { id: ++documentInsertId, content: documentInsertContent(type) };
		showToast(tx('已插入到正文编辑器，请直接修改后保存', 'Inserted into the document editor. Edit it there, then save.'));
	}
	function clearTransientEditingState(): void {
		toast = null;
	}

	async function createSectionInCurrentModule(): Promise<void> {
		clearTransientEditingState();
		const moduleId = currentModule?.id;
		if (!moduleId) {
			showToast(tx('请先创建模块', 'Create a module first'));
			return;
		}
		const text = newSectionTitle.trim();
		if (!text) {
			showToast(tx('请输入章节名称', 'Enter a section name'));
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
			showToast(tx('请输入模块名称', 'Enter a module name'));
			return;
		}
		structureBusy = true;
		try {
			const createdModule = await call('/api/editor/module', { title: text });
			if (!createdModule?.ok || !createdModule.id) return;
			const createdSection = await call('/api/editor/section', { moduleId: createdModule.id, title: tx('开始学习', 'Start here') });
			newModuleTitle = '';
			if (createdSection?.ok && createdSection.id) {
				await goto(`/learn/${createdSection.id}`, { invalidateAll: true });
			} else {
				await refresh();
				showToast(tx('模块已创建，请在左侧继续添加章节', 'Module created. Add more sections from the sidebar.'));
			}
		} finally {
			structureBusy = false;
		}
	}

	// ---- Media upload into the document editor ----
	let uploading = $state(false);
	function insertMediaIntoDocument(url: string, mime: string, name: string): void {
		const isImage = mime.startsWith('image/');
		documentInsertRequest = {
			id: ++documentInsertId,
			content: isImage
				? { type: 'image', attrs: { src: url, alt: name, title: name } }
				: { type: 'video', attrs: { src: url } }
		};
		showToast(isImage ? tx('图片已插入编辑器', 'Image inserted into the editor') : tx('视频已插入编辑器', 'Video inserted into the editor'));
	}
	async function onMediaFile(e: Event): Promise<void> {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		uploading = true;
		const fd = new FormData();
		fd.append('file', file);
		const r = await fetch('/api/editor/upload', { method: 'POST', body: fd }).then((x) => x.json()).catch(() => null);
		input.value = '';
		uploading = false;
		if (r?.ok) insertMediaIntoDocument(r.url, r.mime || file.type, file.name);
		else showToast(`${tx('上传失败', 'Upload failed')}:${r?.error ?? tx('请检查文件后重试', 'Check the file and try again')}`);
	}

	// ---- AI ingestion → preview → choose insertion ----
	interface IngestEvent {
		t: number;
		msg: string;
		msgEn?: string;
	}
	type ApiError = { error?: string; errorEn?: string } | null;
	const apiError = (payload: ApiError, fallbackZh: string, fallbackEn: string): string =>
		i18n().lang === 'zh' ? (payload?.error ?? fallbackZh) : (payload?.errorEn ?? payload?.error ?? fallbackEn);
	const eventText = (ev: IngestEvent): string => (i18n().lang === 'zh' ? ev.msg : (ev.msgEn ?? ev.msg));
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
	let inserting = $state(false);
	let timer: ReturnType<typeof setInterval> | null = null;

	const STAGE_LABEL: Record<string, () => string> = {
		pending: () => tx('准备中', 'Preparing'),
		extracting: () => tx('提取文本', 'Extracting text'),
		converting: () => tx('AI 转译中', 'AI translating'),
		ready: () => tx('转译完成', 'Translation ready'),
		error: () => tx('失败', 'Failed')
	};
	const STAGE_PCT: Record<string, number> = { pending: 8, extracting: 35, converting: 75, ready: 100, error: 100 };
	const ingestPct = $derived(STAGE_PCT[ingestStage] ?? 0);
	const previewRender = $derived(previewBlocks.map((b, i) => ({ ...b, id: `pv-${i}` }) as Block));
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

	function plainParagraphs(text: string): JSONContent[] {
		return text
			.split(/\n{2,}/)
			.map((part) => part.trim())
			.filter(Boolean)
			.map((part) => paragraphNode(part.replace(/\n/g, ' ')));
	}

	function richTextToEditorContent(markdown: string): Content {
		const nodes: JSONContent[] = [];
		for (const raw of markdown.split(/\n+/)) {
			const line = raw.trim();
			if (!line || /^-{3,}$/.test(line)) continue;
			const heading = /^(#{2,3})\s+(.+)$/.exec(line);
			if (heading) {
				nodes.push({ type: 'heading', attrs: { level: heading[1]!.length }, content: textContent(heading[2]!) });
				continue;
			}
			const bullet = /^[-*]\s+(.+)$/.exec(line);
			if (bullet) {
				nodes.push({
					type: 'bulletList',
					content: [{ type: 'listItem', content: [paragraphNode(bullet[1]!)] }]
				});
				continue;
			}
			nodes.push(paragraphNode(line.replace(/^>\s?/, '')));
		}
		return nodes.length ? nodes : paragraphNode(markdown.trim());
	}

	function previewBlockToEditorContent(block: BlockInput): Content {
		switch (block.type) {
			case 'richtext':
				return richTextToEditorContent(block.markdown);
			case 'heading':
				return { type: 'heading', attrs: { level: block.level }, content: textContent(block.text) };
			case 'paragraph':
				return plainParagraphs(block.text);
			case 'list':
				return {
					type: block.ordered ? 'orderedList' : 'bulletList',
					content: block.items.map((item) => ({ type: 'listItem', content: [paragraphNode(item)] }))
				};
			case 'quote':
				return {
					type: 'blockquote',
					content: [paragraphNode(block.text), ...(block.cite ? [paragraphNode(`- ${block.cite}`)] : [])]
				};
			case 'callout':
				return {
					type: 'blockquote',
					content: [
						{
							type: 'paragraph',
							content: [{ type: 'text', text: block.title, marks: [{ type: 'bold' }] }]
						},
						...plainParagraphs(block.body)
					]
				};
			case 'image':
				return { type: 'image', attrs: { src: block.src, alt: block.alt, title: block.caption ?? block.alt } };
			case 'video':
				return { type: 'video', attrs: { src: block.src, poster: block.poster ?? null } };
			default:
				return paragraphNode(typeLabel(block.type));
		}
	}

	function flattenEditorContent(content: Content): JSONContent[] {
		if (typeof content === 'string') return [{ type: 'paragraph', content: [{ type: 'text', text: content }] }];
		return Array.isArray(content) ? content : [content as JSONContent];
	}

	function previewBlocksToEditorContent(blocks: BlockInput[]): Content {
		return blocks.flatMap((block) => flattenEditorContent(previewBlockToEditorContent(block)));
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
			showToast(tx('文档不能为空', 'Document cannot be empty'));
			return;
		}
		busy = true;
		try {
			for (const block of section.blocks) {
				await call('/api/editor/block', { id: block.id }, 'DELETE');
			}
			await call('/api/editor/blocks/insert', {
				sectionId: section.id,
				blocks: [{ type: 'richtext', markdown: md }],
				position: 'start'
			});
			await refresh();
			showToast(tx('整篇文档已保存', 'Document saved'));
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
		ingestStatus = tx('上传中', 'Uploading');
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
			ingestStatus = tx('失败:', 'Failed:') + apiError(res, '上传错误', 'Upload error');
			return;
		}
		const jobId: string = res.jobId;
		const poll = async (): Promise<void> => {
			const s = await fetch(`/api/editor/ingest?jobId=${jobId}`).then((r) => r.json()).catch(() => null);
			if (!s?.ok) {
				stopTimer();
				ingestBusy = false;
				ingestStage = 'error';
				ingestStatus = tx('转译任务丢失(服务可能重启过),请重新上传', 'Translation job was lost. Please upload again.');
				return;
			}
			ingestStage = s.status;
			ingestStatus = STAGE_LABEL[s.status]?.() ?? s.status;
			ingestUsedAgent = !!s.usedAgent;
			if (typeof s.tokens === 'number') ingestTokens = s.tokens;
			if (Array.isArray(s.events)) ingestEvents = s.events;
			if (s.status === 'ready') {
				stopTimer();
				ingestBusy = false;
				previewBlocks = Array.isArray(s.blocks) ? s.blocks : [];
				showPreview = true;
				return;
			}
			if (s.status === 'error') {
				stopTimer();
				ingestBusy = false;
				ingestStatus = tx('失败:', 'Failed:') + apiError(s, '转译失败', 'Translation failed');
				return;
			}
			setTimeout(poll, 1000);
		};
		void poll();
	}

	function confirmInsert(): void {
		if (previewBlocks.length === 0) return;
		inserting = true;
		try {
			documentInsertRequest = { id: ++documentInsertId, content: previewBlocksToEditorContent(previewBlocks) };
			showPreview = false;
			previewBlocks = [];
			showToast(tx('AI 转译内容已插入正文编辑器，请检查措辞和格式后保存', 'AI translation inserted into the editor. Review wording and formatting, then save.'));
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
				{preview ? tx('学员预览', 'Learner preview') : tx('编辑模式', 'Edit mode')}
			</button>
			<input class="title-input" bind:value={title} oninput={scheduleMetaSave} aria-label={tx('章节标题', 'Section title')} />
			<label class="dwell">{tx('最短阅读', 'Min read')}
				<input type="number" min="0" bind:value={minDwellSec} oninput={scheduleMetaSave} /> {tx('秒', 'sec')}
			</label>
			<span class="save-status" class:saving={saveStatus === 'saving'}>
				{#if saveStatus === 'saving'}{tx('保存中…', 'Saving...')}{:else if saveStatus === 'saved'}{tx('已保存', 'Saved')} <Icon name="check" size={13} stroke={2.5} />{/if}
			</span>
		</div>
		<div class="bar-right">
			<a class="btn-sm ghost preview-link" href={`/learn/${section.id}?view=learner`}>
				<Icon name="graduation-cap" size={15} /> {tx('真实学生视图', 'Live learner view')}
			</a>
			<label class="btn-sm ghost upload ai-upload" class:busy={ingestBusy}>
				{#if ingestBusy}{tx('AI 转译中…', 'AI translating...')}{:else}<Icon name="sparkles" size={15} /> {tx('AI 转译文件', 'AI translate file')}{/if}
				<input type="file" accept=".txt,.md,.markdown,.docx,.pdf,.pptx" hidden onchange={onIngestFile} disabled={ingestBusy} />
			</label>
			<label class="btn-sm ghost upload video-upload" class:busy={uploading}>
				{#if uploading}{tx('上传中…', 'Uploading...')}{:else}<Icon name="image" size={15} /> {tx('插入媒体', 'Insert media')}{/if}
				<input type="file" accept="image/*,video/*" hidden onchange={onMediaFile} disabled={uploading} />
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
						<button class="link" onclick={() => (showLog = !showLog)}>{showLog ? tx('隐藏详情', 'Hide details') : tx('查看详情', 'View details')}</button>
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
					{#each ingestEvents as ev, evi (evi)}<li><span class="mono">+{(ev.t / 1000).toFixed(1)}s</span> {eventText(ev)}</li>{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<div class="canvas" class:editing={!preview}>
		<article class="content">
			<p class="eyebrow"><span class="dot"></span>{section.title || tx('未命名章节', 'Untitled section')}</p>

			{#if preview}
				{#each section.blocks as block (block.id)}
					{#if !isExtractorNoiseBlock(block)}
						<BlockRenderer {block} quizzes={section.quizzes} sectionId={section.id} onintervals={noop} onpassed={noop} />
					{/if}
				{/each}
				{#if section.blocks.length === 0}<p class="muted">{tx('本节暂无内容。', 'This section has no content yet.')}</p>{/if}
			{:else}
				<div class="word-shell">
					{#key documentEditorKey}
						<LazyRichTextEditor
							initial={documentMarkdown}
							insertRequest={documentInsertRequest}
							onsave={replaceDocumentContent}
							oncancel={() => showToast(tx('继续编辑中，未做更改', 'Still editing. No changes saved.'))}
						/>
					{/key}
				</div>
			{/if}
		</article>

		{#if !preview}
			<aside class="sidepanel" aria-label={tx('创建与插入', 'Create and insert')}>
				<section class="panel-card hero-panel">
					<div class="panel-kicker"><Icon name="panel-right" size={15} /> {tx('编辑工作台', 'Editor workspace')}</div>
					<h2>{tx('创建与插入', 'Create and insert')}</h2>
					<p>{tx('正文像文档一样编辑；章节、模块和结构化内容都从这里添加。', 'Edit body text like a document. Add sections, modules, and structured content here.')}</p>
				</section>

				<section class="panel-card">
					<div class="panel-head">
						<span class="panel-index">01</span>
						<div>
							<h3>{tx('课程结构', 'Course structure')}</h3>
							<p>{tx('当前模块：', 'Current module: ')}{currentModuleTitle}</p>
						</div>
					</div>
					<label class="field">
						<span>{tx('新章节', 'New section')}</span>
						<div class="inline-create">
							<input bind:value={newSectionTitle} placeholder={tx('例如：安全合规测验', 'Example: Security compliance quiz')} onkeydown={(e) => { if (e.key === 'Enter') createSectionInCurrentModule(); }} />
							<button class="icon-action primary" aria-label={tx('创建新章节', 'Create new section')} title={tx('创建新章节', 'Create new section')} onclick={createSectionInCurrentModule} disabled={structureBusy}><Icon name="plus" size={16} /></button>
						</div>
					</label>
					<label class="field">
						<span>{tx('新模块', 'New module')}</span>
						<div class="inline-create">
							<input bind:value={newModuleTitle} placeholder={tx('例如：XJMK', 'Example: XJMK')} onkeydown={(e) => { if (e.key === 'Enter') createModuleWithFirstSection(); }} />
							<button class="icon-action" aria-label={tx('创建新模块', 'Create new module')} title={tx('创建新模块', 'Create new module')} onclick={createModuleWithFirstSection} disabled={structureBusy}><Icon name="layers" size={16} /></button>
						</div>
					</label>
				</section>

				<section class="panel-card editor-tools">
					<div class="panel-head">
						<span class="panel-index">02</span>
						<div>
							<h3>{tx('编辑器插入', 'Editor inserts')}</h3>
							<p>{tx('标题、提示和列表都会直接进入正文光标处', 'Everything goes directly into the rich text editor')}</p>
						</div>
					</div>
					<div class="editor-insert-grid">
						<button type="button" class="tool-tile" onclick={() => insertIntoDocument('heading')}>
							<span class="tile-icon"><Icon name="file-text" size={18} /></span>
							<span><strong>{tx('标题', 'Heading')}</strong><small>{tx('插入到光标处', 'Insert at cursor')}</small></span>
						</button>
						<button type="button" class="tool-tile" onclick={() => insertIntoDocument('callout')}>
							<span class="tile-icon"><Icon name="info" size={18} /></span>
							<span><strong>{tx('重点提示', 'Callout')}</strong><small>{tx('插入后在正文中编辑', 'Edit inline')}</small></span>
						</button>
						<button type="button" class="tool-tile" onclick={() => insertIntoDocument('list')}>
							<span class="tile-icon"><Icon name="list" size={18} /></span>
							<span><strong>{tx('列表', 'List')}</strong><small>{tx('每一项都可直接改写', 'Editable list')}</small></span>
						</button>
					</div>
				</section>

				<section class="panel-card quick-panel">
					<div class="panel-head">
						<span class="panel-index">03</span>
						<div>
							<h3>{tx('导入素材', 'Import assets')}</h3>
							<p>{tx('图片、视频和 AI 转译都进入同一个正文编辑器', 'Images, videos, and AI translations stay in the same editor')}</p>
						</div>
					</div>
					<label class="wide-action" class:busy={uploading}>
						<Icon name="image" size={16} /> {uploading ? tx('上传中…', 'Uploading...') : tx('插入图片', 'Insert image')}
						<input type="file" accept="image/*" hidden onchange={onMediaFile} disabled={uploading} />
					</label>
					<label class="wide-action" class:busy={uploading}>
						<Icon name="video" size={16} /> {uploading ? tx('上传中…', 'Uploading...') : tx('插入视频', 'Insert video')}
						<input type="file" accept="video/*" hidden onchange={onMediaFile} disabled={uploading} />
					</label>
					<label class="wide-action" class:busy={ingestBusy}>
						<Icon name="sparkles" size={16} /> {ingestBusy ? tx('AI 转译中…', 'AI translating...') : tx('AI 转译 PDF / PPTX / Word', 'AI translate PDF / PPTX / Word')}
						<input type="file" accept=".txt,.md,.markdown,.docx,.pdf,.pptx" hidden onchange={onIngestFile} disabled={ingestBusy} />
					</label>
				</section>
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
	<div class="modal-bg" transition:fade={{ duration: 200 }}><div class="modal" role="dialog" aria-modal="true" aria-label={tx('AI 转译预览', 'AI translation preview')} tabindex="-1" in:scale={{ start: 0.96, opacity: 0, duration: 320, easing: cubicOut }} out:scale={{ start: 0.98, opacity: 0, duration: 180 }}>
		<header class="modal-head">
			<strong>{tx(`AI 转译预览 · ${previewBlocks.length} 块`, `AI translation preview · ${previewBlocks.length} blocks`)}</strong>
			<span class="badge">{ingestUsedAgent ? `qwen3.7-plus · ${ingestTokens} tokens` : tx('本地解析', 'Local parser')}</span>
		</header>
		<div class="modal-body">
			<div class="preview-pane">
				{#if previewRender.length === 0}<p class="hint">{tx('没有可用内容。', 'No usable content.')}</p>{/if}
				{#each previewRender as block (block.id)}
					{#if block.type === 'quiz'}<div class="quiz-ph"><Icon name="file-text" size={16} />{tx('题目区', 'Quiz area')}</div>
					{:else}<BlockRenderer {block} quizzes={[]} sectionId={section.id} onintervals={noop} onpassed={noop} />{/if}
				{/each}
			</div>
			<aside class="log-pane">
				<div class="rail-label">{tx('事件日志', 'Event log')}</div>
				<ul class="log">{#each ingestEvents as ev, evi (evi)}<li><span class="mono">+{(ev.t / 1000).toFixed(1)}s</span> {eventText(ev)}</li>{/each}</ul>
			</aside>
		</div>
		<footer class="modal-foot">
			<div class="pos"><Icon name="sparkles" size={15} /> {tx('确认后插入到正文编辑器当前光标处', 'Confirm to insert at the current editor cursor')}</div>
			<div class="spacer"></div>
			<button class="btn-sm ghost" onclick={cancelPreview} disabled={inserting}>{tx('取消', 'Cancel')}</button>
			<button class="btn-sm primary" onclick={confirmInsert} disabled={inserting}>{inserting ? tx('插入中…', 'Inserting...') : tx(`插入到编辑器(${previewBlocks.length} 段)`, `Insert into editor (${previewBlocks.length})`)}</button>
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
	.field input {
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
	.field input:focus {
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
	.editor-insert-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.tool-tile {
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
		user-select: none;
		touch-action: manipulation;
		transition: var(--transition-fast);
	}
	.tool-tile:active {
		transform: translateY(1px);
	}
	.tool-tile:nth-child(1) {
		--tile-accent: var(--accent-blue);
		--tile-bg: var(--accent-blue-bg);
	}
	.tool-tile:nth-child(2) {
		--tile-accent: var(--accent-amber);
		--tile-bg: var(--accent-amber-bg);
	}
	.tool-tile:nth-child(3) {
		--tile-accent: var(--accent-cyan);
		--tile-bg: var(--accent-cyan-bg);
	}
	.tool-tile:nth-child(4) {
		--tile-accent: var(--accent-violet);
		--tile-bg: var(--accent-violet-bg);
	}
	.tool-tile:nth-child(5) {
		--tile-accent: var(--accent-rose);
		--tile-bg: var(--accent-rose-bg);
	}
	:global(:root[data-theme='dark']) .tool-tile {
		background:
			linear-gradient(90deg, var(--tile-bg, transparent), transparent 58%),
			#080a0c;
		border-color: color-mix(in srgb, var(--tile-accent, white) 18%, rgba(255, 255, 255, 0.08));
	}
	:global(:root[data-theme='dark']) .tool-tile:hover {
		background:
			linear-gradient(180deg, var(--tile-bg, rgba(47, 212, 122, 0.075)), rgba(255, 255, 255, 0.012)),
			#0b0e11;
		border-color: color-mix(in srgb, var(--tile-accent, var(--brand-500)) 42%, rgba(255, 255, 255, 0.14));
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
	}
	.tool-tile:hover {
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
	.tool-tile strong,
	.tool-tile small {
		display: block;
	}
	.tool-tile strong {
		font-size: var(--text-sm);
	}
	.tool-tile small {
		margin-top: 2px;
		color: var(--text-tertiary);
		font-size: var(--text-xs);
		line-height: 1.35;
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
	.hint {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		margin: var(--space-1) 0 var(--space-3);
	}
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
			position: static;
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
		.editor-insert-grid {
			grid-template-columns: 1fr;
		}
		.badge {
			margin-right: auto;
		}
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
