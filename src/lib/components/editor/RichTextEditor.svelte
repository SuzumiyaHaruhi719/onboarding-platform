<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { Editor, Node, mergeAttributes, type Content } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import { Markdown } from 'tiptap-markdown';
	import Icon from '$lib/components/Icon.svelte';
	import { useI18n } from '$lib/i18n/context';

	let {
		initial = '',
		insertRequest = null,
		onsave,
		oncancel
	}: { initial?: string; insertRequest?: { id: number; content: Content } | null; onsave: (markdown: string) => void; oncancel: () => void } = $props();

	let element: HTMLDivElement;
	let editor: Editor | null = null;
	let tick = $state(0);
	let err = $state('');
	let linkOpen = $state(false);
	let linkUrl = $state('');
	let lastInsertRequestId = 0;
	const startMarkdown = untrack(() => initial);
	const i18n = useI18n();
	const tx = (zh: string, en: string): string => (i18n().lang === 'zh' ? zh : en);

	const MediaImage = Node.create({
		name: 'image',
		group: 'block',
		atom: true,
		addAttributes() {
			return {
				src: { default: null },
				alt: { default: '' },
				title: { default: '' }
			};
		},
		parseHTML() {
			return [{ tag: 'img[src]' }];
		},
		renderHTML({ HTMLAttributes }) {
			return ['img', mergeAttributes(HTMLAttributes)];
		}
	});

	const MediaVideo = Node.create({
		name: 'video',
		group: 'block',
		atom: true,
		addAttributes() {
			return {
				src: { default: null },
				poster: { default: null }
			};
		},
		parseHTML() {
			return [{ tag: 'video[src]' }];
		},
		renderHTML({ HTMLAttributes }) {
			return ['video', mergeAttributes(HTMLAttributes, { controls: '', preload: 'metadata' })];
		}
	});

	onMount(() => {
		editor = new Editor({
			element,
			extensions: [
				StarterKit.configure({
					heading: { levels: [2, 3] },
					link: { openOnClick: false }
				}),
				MediaImage,
				MediaVideo,
				Markdown.configure({ html: false, breaks: false, transformPastedText: true })
			],
			content: startMarkdown,
			autofocus: false,
			onTransaction: () => {
				tick++;
				if (err) err = '';
			}
		});
		tick++;
	});

	onDestroy(() => editor?.destroy());

	$effect(() => {
		const request = insertRequest;
		if (!editor || !request || request.id === lastInsertRequestId) return;
		lastInsertRequestId = request.id;
		editor.chain().focus().insertContent(request.content).run();
		tick++;
	});

	function active(name: string, attrs?: Record<string, unknown>): boolean {
		void tick;
		return editor?.isActive(name, attrs) ?? false;
	}

	function can(command: 'undo' | 'redo'): boolean {
		void tick;
		if (!editor) return false;
		return command === 'undo' ? editor.can().undo() : editor.can().redo();
	}

	function chain() {
		return editor!.chain().focus();
	}

	function setParagraph(): void {
		chain().setParagraph().run();
	}

	function openLinkPanel(): void {
		if (!editor) return;
		const attrs = editor.getAttributes('link') as { href?: string };
		linkUrl = attrs.href ?? '';
		linkOpen = !linkOpen;
	}

	function normalizeUrl(url: string): string {
		if (/^(https?:|mailto:|#|\/)/i.test(url)) return url;
		return `https://${url}`;
	}

	function applyLink(): void {
		if (!editor) return;
		const url = linkUrl.trim();
		if (!url) chain().unsetLink().run();
		else chain().extendMarkRange('link').setLink({ href: normalizeUrl(url) }).run();
		linkOpen = false;
	}

	function clearLink(): void {
		if (!editor) return;
		chain().unsetLink().run();
		linkUrl = '';
		linkOpen = false;
	}

	function onLinkKey(e: KeyboardEvent): void {
		if (e.key === 'Enter') applyLink();
		if (e.key === 'Escape') linkOpen = false;
	}

	function save(): void {
		if (!editor) return;
		const html = editor.getHTML();
		if (!editor.getText().trim() && !/<(img|video)\b/i.test(html)) {
			err = tx('内容不能为空，请先输入文字', 'Content cannot be empty. Add some text first.');
			return;
		}
		onsave(html);
	}

	function onWrapKeydown(e: KeyboardEvent): void {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
			e.preventDefault();
			save();
		}
	}
</script>

<svelte:window onkeydown={onWrapKeydown} />

<div class="rte" role="region" aria-label={tx('富文本编辑器', 'Rich text editor')}>
	<div class="ribbon" aria-label={tx('富文本工具栏', 'Rich text toolbar')}>
		<div class="ribbon-group">
			<span class="group-label">{tx('历史', 'History')}</span>
			<div class="button-row">
				<button type="button" class="ico" title={tx('撤销', 'Undo')} aria-label={tx('撤销', 'Undo')} disabled={!can('undo')} onclick={() => chain().undo().run()}><Icon name="undo-2" size={16} /></button>
				<button type="button" class="ico" title={tx('重做', 'Redo')} aria-label={tx('重做', 'Redo')} disabled={!can('redo')} onclick={() => chain().redo().run()}><Icon name="redo-2" size={16} /></button>
			</div>
		</div>
		<div class="ribbon-group wide">
			<span class="group-label">{tx('段落样式', 'Paragraph')}</span>
			<div class="button-row segmented">
				<button type="button" class:on={!active('heading')} onclick={setParagraph}>{tx('正文', 'Body')}</button>
				<button type="button" class:on={active('heading', { level: 2 })} onclick={() => chain().toggleHeading({ level: 2 }).run()}>{tx('标题', 'Heading')}</button>
				<button type="button" class:on={active('heading', { level: 3 })} onclick={() => chain().toggleHeading({ level: 3 }).run()}>{tx('小标题', 'Subhead')}</button>
			</div>
		</div>
		<div class="ribbon-group">
			<span class="group-label">{tx('文字', 'Text')}</span>
			<div class="button-row">
				<button type="button" class="b" class:on={active('bold')} title={tx('加粗', 'Bold')} onclick={() => chain().toggleBold().run()}>B</button>
				<button type="button" class="i" class:on={active('italic')} title={tx('斜体', 'Italic')} onclick={() => chain().toggleItalic().run()}>I</button>
				<button type="button" class="s" class:on={active('strike')} title={tx('删除线', 'Strikethrough')} onclick={() => chain().toggleStrike().run()}>S</button>
				<button type="button" class="code" class:on={active('code')} title={tx('行内代码', 'Inline code')} onclick={() => chain().toggleCode().run()}>{'</>'}</button>
			</div>
		</div>
		<div class="ribbon-group">
			<span class="group-label">{tx('结构', 'Structure')}</span>
			<div class="button-row">
				<button type="button" class="ico" class:on={active('bulletList')} title={tx('无序列表', 'Bulleted list')} aria-label={tx('无序列表', 'Bulleted list')} onclick={() => chain().toggleBulletList().run()}><Icon name="list" size={16} /></button>
				<button type="button" class="ico" class:on={active('orderedList')} title={tx('有序列表', 'Numbered list')} aria-label={tx('有序列表', 'Numbered list')} onclick={() => chain().toggleOrderedList().run()}><Icon name="list-ordered" size={16} /></button>
				<button type="button" class="ico" class:on={active('blockquote')} title={tx('引用', 'Quote')} aria-label={tx('引用', 'Quote')} onclick={() => chain().toggleBlockquote().run()}><Icon name="text-quote" size={16} /></button>
				<button type="button" class="ico" class:on={active('link')} title={tx('链接', 'Link')} aria-label={tx('链接', 'Link')} onclick={openLinkPanel}><Icon name="link" size={16} /></button>
			</div>
		</div>
		<div class="ribbon-spacer"></div>
		<div class="ribbon-save">
			<button class="btn primary" onclick={save}>{tx('保存', 'Save')}</button>
			<button class="btn ghost" onclick={oncancel}>{tx('取消', 'Cancel')}</button>
		</div>
	</div>

	{#if linkOpen}
		<div class="link-panel">
			<label>
				<span>{tx('链接 URL', 'Link URL')}</span>
				<input type="url" placeholder="https://example.com" bind:value={linkUrl} onkeydown={onLinkKey} />
			</label>
			<button type="button" class="mini primary" onclick={applyLink}>{tx('应用', 'Apply')}</button>
			<button type="button" class="mini" onclick={clearLink}>{tx('清除', 'Clear')}</button>
		</div>
	{/if}

	<div class="surface-shell">
		<div class="surface" bind:this={element}></div>
	</div>

	<div class="statusbar">
		{#if err}
			<span class="err" role="alert">{err}</span>
		{:else}
			<span class="tip">{tx('像文档一样直接输入；支持粘贴 Word/PDF 文本、列表、标题、引用和 Ctrl/⌘+S 保存。', 'Type directly like a document. Paste Word/PDF text, lists, headings, quotes, and save with Ctrl/Cmd+S.')}</span>
		{/if}
	</div>
</div>

<style>
	.rte {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		background:
			linear-gradient(135deg, var(--accent-blue-bg), transparent 38%),
			var(--surface-container);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
	}
	.ribbon {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: stretch;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border-default);
		background:
			linear-gradient(90deg, var(--accent-violet-bg), transparent 44%),
			var(--surface-elevated);
	}
	.ribbon-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: max-content;
	}
	.ribbon-group.wide {
		min-width: 220px;
	}
	.ribbon-group:nth-child(1) .group-label {
		color: var(--accent-amber);
	}
	.ribbon-group:nth-child(2) .group-label {
		color: var(--text-brand);
	}
	.ribbon-group:nth-child(3) .group-label {
		color: var(--accent-violet);
	}
	.ribbon-group:nth-child(4) .group-label {
		color: var(--accent-blue);
	}
	.group-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		line-height: 1;
	}
	.button-row {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 3px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0)),
			var(--surface-subtle);
	}
	.ribbon button,
	.mini,
	.btn {
		transition: var(--transition-fast);
	}
	.ribbon button {
		min-width: 34px;
		height: 34px;
		padding: 0 var(--space-2);
		border: 1px solid transparent;
		background: transparent;
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		font-weight: 700;
		cursor: pointer;
	}
	.ribbon button:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.ribbon button.on {
		background: var(--surface-elevated);
		border-color: var(--accent-blue);
		color: var(--accent-blue);
		box-shadow: inset 0 -2px 0 var(--accent-blue);
	}
	.ribbon button:disabled {
		opacity: 0.38;
		cursor: not-allowed;
	}
	.segmented {
		width: 100%;
	}
	.segmented button {
		flex: 1;
		min-width: 64px;
	}
	.ribbon button.ico {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.ribbon .b {
		font-weight: 900;
	}
	.ribbon .i {
		font-style: italic;
	}
	.ribbon .s {
		text-decoration: line-through;
	}
	.ribbon .code {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.ribbon-spacer {
		flex: 1;
		min-width: var(--space-6);
	}
	.ribbon-save {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
	}
	.link-panel {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border-default);
		background: var(--surface-page);
	}
	.link-panel label {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.link-panel span {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
	}
	.link-panel input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-elevated);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--text-sm);
	}
	.link-panel input:focus {
		outline: none;
		border-color: var(--brand-500);
		box-shadow: 0 0 0 3px var(--brand-200);
	}
	.mini {
		height: 34px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-elevated);
		color: var(--text-secondary);
		font-weight: 700;
		cursor: pointer;
	}
	.mini.primary {
		border-color: var(--brand-500);
		background: var(--brand-500);
		color: var(--text-inverse);
	}
	.surface-shell {
		padding: var(--space-6);
		background:
			radial-gradient(circle at 12% 0%, var(--accent-violet-bg), transparent 30%),
			radial-gradient(circle at 92% 8%, var(--accent-blue-bg), transparent 34%),
			var(--surface-page);
	}
	.surface {
		min-height: min(58vh, 640px);
		max-height: 64vh;
		overflow-y: auto;
		padding: var(--space-8) var(--space-10);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0) 120px),
			var(--surface-elevated);
		box-shadow: var(--shadow-sm);
	}
	.surface :global(.ProseMirror) {
		outline: none;
		color: var(--text-primary);
		line-height: 1.78;
		max-width: 76ch;
		min-height: 420px;
	}
	.surface :global(.ProseMirror:focus) {
		outline: none;
	}
	.surface :global(h2) {
		font-size: var(--text-2xl);
		font-weight: 800;
		color: var(--text-primary);
		margin: var(--space-5) 0 var(--space-2);
		letter-spacing: 0;
	}
	.surface :global(h3) {
		font-size: var(--text-xl);
		font-weight: 800;
		color: var(--text-primary);
		margin: var(--space-4) 0 var(--space-2);
	}
	.surface :global(p) {
		margin: 0 0 var(--space-3);
	}
	.surface :global(ul),
	.surface :global(ol) {
		padding-left: var(--space-6);
		margin: 0 0 var(--space-3);
	}
	.surface :global(li) {
		margin: var(--space-1) 0;
	}
	.surface :global(blockquote) {
		border-left: 3px solid var(--accent-amber);
		background: var(--accent-amber-bg);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		margin: 0 0 var(--space-3);
		color: var(--text-primary);
	}
	.surface :global(img),
	.surface :global(video) {
		display: block;
		width: min(100%, 760px);
		max-height: 460px;
		object-fit: contain;
		margin: var(--space-4) 0;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-subtle);
		box-shadow: var(--shadow-sm);
	}
	.surface :global(video) {
		aspect-ratio: 16 / 9;
	}
	.surface :global(a) {
		color: var(--accent-blue);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.surface :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
		background: var(--surface-subtle);
		padding: 1px 5px;
		border-radius: var(--radius-sm);
	}
	.statusbar {
		display: flex;
		align-items: center;
		min-height: 40px;
		padding: var(--space-2) var(--space-4);
		border-top: 1px solid var(--border-default);
		background: var(--surface-elevated);
	}
	:global(:root[data-theme='dark']) .rte {
		border-color: color-mix(in srgb, var(--accent-violet) 18%, rgba(255, 255, 255, 0.14));
		background:
			linear-gradient(135deg, var(--accent-violet-bg), transparent 38%),
			#080a0c;
		box-shadow:
			0 24px 80px rgba(0, 0, 0, 0.55),
			inset 0 1px 0 rgba(255, 255, 255, 0.035);
	}
	:global(:root[data-theme='dark']) .ribbon,
	:global(:root[data-theme='dark']) .statusbar {
		background:
			linear-gradient(90deg, var(--accent-violet-bg), transparent 44%),
			rgba(13, 15, 18, 0.96);
	}
	:global(:root[data-theme='dark']) .button-row {
		background: #101318;
		border-color: rgba(255, 255, 255, 0.08);
	}
	:global(:root[data-theme='dark']) .surface-shell {
		background:
			radial-gradient(circle at 12% 0%, var(--accent-violet-bg), transparent 30%),
			radial-gradient(circle at 92% 8%, var(--accent-blue-bg), transparent 34%),
			#050607;
	}
	:global(:root[data-theme='dark']) .surface {
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.022), rgba(255, 255, 255, 0) 120px),
			#0a0c0e;
		border-color: color-mix(in srgb, var(--accent-blue) 16%, rgba(255, 255, 255, 0.1));
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.035),
			0 18px 54px rgba(0, 0, 0, 0.4);
	}
	:global(:root[data-theme='dark']) .surface :global(blockquote) {
		background: var(--accent-amber-bg);
	}
	.btn {
		min-height: 38px;
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-lg);
		font-weight: 800;
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.btn.primary {
		border: none;
		background: var(--brand-500);
		color: var(--text-inverse);
	}
	.btn.primary:hover {
		background: var(--brand-600);
	}
	.btn.ghost {
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		color: var(--text-secondary);
	}
	.btn.ghost:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.tip,
	.err {
		font-size: var(--text-xs);
	}
	.tip {
		color: var(--text-tertiary);
	}
	.err {
		font-weight: 800;
		color: var(--error);
	}
	@media (max-width: 768px) {
		.ribbon {
			position: static;
			flex-wrap: wrap;
			align-items: stretch;
			overflow-x: visible;
			padding: var(--space-2);
		}
		.ribbon-group,
		.ribbon-group.wide {
			flex: 1 1 auto;
			min-width: 0;
		}
		.ribbon-group.wide {
			flex-basis: 100%;
		}
		.group-label {
			display: none;
		}
		.button-row {
			width: 100%;
			flex-wrap: wrap;
		}
		.segmented button {
			min-width: 0;
		}
		.ribbon-spacer {
			display: none;
		}
		.ribbon-save {
			flex: 1 1 100%;
			min-width: 0;
		}
		.ribbon-save .btn {
			flex: 1;
			min-height: 34px;
			padding-inline: var(--space-3);
		}
		.statusbar {
			display: none;
		}
		.surface-shell {
			padding: var(--space-2);
		}
		.surface {
			min-height: 360px;
			padding: var(--space-4);
		}
	}
</style>
