<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import { Markdown } from 'tiptap-markdown';
	import Icon from '$lib/components/Icon.svelte';

	let {
		initial = '',
		onsave,
		oncancel
	}: { initial?: string; onsave: (markdown: string) => void; oncancel: () => void } = $props();

	let element: HTMLDivElement;
	let editor: Editor | null = null;
	let tick = $state(0);
	let err = $state('');
	let linkOpen = $state(false);
	let linkUrl = $state('');
	const startMarkdown = untrack(() => initial);

	onMount(() => {
		editor = new Editor({
			element,
			extensions: [
				StarterKit.configure({
					heading: { levels: [2, 3] },
					link: { openOnClick: false }
				}),
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
		const storage = editor.storage as { markdown?: { getMarkdown: () => string } };
		const md = storage.markdown?.getMarkdown() ?? '';
		if (!md.trim()) {
			err = '内容不能为空，请先输入文字';
			return;
		}
		onsave(md);
	}

	function onWrapKeydown(e: KeyboardEvent): void {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
			e.preventDefault();
			save();
		}
	}
</script>

<svelte:window onkeydown={onWrapKeydown} />

<div class="rte" role="region" aria-label="富文本编辑器">
	<div class="ribbon" aria-label="富文本工具栏">
		<div class="ribbon-group">
			<span class="group-label">历史</span>
			<div class="button-row">
				<button type="button" class="ico" title="撤销" aria-label="撤销" disabled={!can('undo')} onclick={() => chain().undo().run()}><Icon name="undo-2" size={16} /></button>
				<button type="button" class="ico" title="重做" aria-label="重做" disabled={!can('redo')} onclick={() => chain().redo().run()}><Icon name="redo-2" size={16} /></button>
			</div>
		</div>
		<div class="ribbon-group wide">
			<span class="group-label">段落样式</span>
			<div class="button-row segmented">
				<button type="button" class:on={!active('heading')} onclick={setParagraph}>正文</button>
				<button type="button" class:on={active('heading', { level: 2 })} onclick={() => chain().toggleHeading({ level: 2 }).run()}>标题</button>
				<button type="button" class:on={active('heading', { level: 3 })} onclick={() => chain().toggleHeading({ level: 3 }).run()}>小标题</button>
			</div>
		</div>
		<div class="ribbon-group">
			<span class="group-label">文字</span>
			<div class="button-row">
				<button type="button" class="b" class:on={active('bold')} title="加粗" onclick={() => chain().toggleBold().run()}>B</button>
				<button type="button" class="i" class:on={active('italic')} title="斜体" onclick={() => chain().toggleItalic().run()}>I</button>
				<button type="button" class="s" class:on={active('strike')} title="删除线" onclick={() => chain().toggleStrike().run()}>S</button>
				<button type="button" class="code" class:on={active('code')} title="行内代码" onclick={() => chain().toggleCode().run()}>{'</>'}</button>
			</div>
		</div>
		<div class="ribbon-group">
			<span class="group-label">结构</span>
			<div class="button-row">
				<button type="button" class="ico" class:on={active('bulletList')} title="无序列表" aria-label="无序列表" onclick={() => chain().toggleBulletList().run()}><Icon name="list" size={16} /></button>
				<button type="button" class="ico" class:on={active('orderedList')} title="有序列表" aria-label="有序列表" onclick={() => chain().toggleOrderedList().run()}><Icon name="list-ordered" size={16} /></button>
				<button type="button" class="ico" class:on={active('blockquote')} title="引用" aria-label="引用" onclick={() => chain().toggleBlockquote().run()}><Icon name="text-quote" size={16} /></button>
				<button type="button" class="ico" class:on={active('link')} title="链接" aria-label="链接" onclick={openLinkPanel}><Icon name="link" size={16} /></button>
			</div>
		</div>
		<div class="ribbon-spacer"></div>
		<div class="ribbon-save">
			<button class="btn primary" onclick={save}>保存</button>
			<button class="btn ghost" onclick={oncancel}>取消</button>
		</div>
	</div>

	{#if linkOpen}
		<div class="link-panel">
			<label>
				<span>链接 URL</span>
				<input type="url" placeholder="https://example.com" bind:value={linkUrl} onkeydown={onLinkKey} />
			</label>
			<button type="button" class="mini primary" onclick={applyLink}>应用</button>
			<button type="button" class="mini" onclick={clearLink}>清除</button>
		</div>
	{/if}

	<div class="surface-shell">
		<div class="surface" bind:this={element}></div>
	</div>

	<div class="statusbar">
		{#if err}
			<span class="err" role="alert">{err}</span>
		{:else}
			<span class="tip">像文档一样直接输入；支持粘贴 Word/PDF 文本、列表、标题、引用和 Ctrl/⌘+S 保存。</span>
		{/if}
	</div>
</div>

<style>
	.rte {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		background: var(--surface-container);
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
		background: var(--surface-elevated);
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
		background: var(--surface-subtle);
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
		border-color: var(--brand-500);
		color: var(--text-brand);
		box-shadow: inset 0 -2px 0 var(--brand-500);
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
		background: var(--surface-page);
	}
	.surface {
		min-height: min(58vh, 640px);
		max-height: 64vh;
		overflow-y: auto;
		padding: var(--space-8) var(--space-10);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background: var(--surface-elevated);
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
		border-left: 3px solid var(--brand-500);
		background: var(--surface-subtle);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		margin: 0 0 var(--space-3);
		color: var(--text-primary);
	}
	.surface :global(a) {
		color: var(--text-brand);
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
		border-color: rgba(255, 255, 255, 0.14);
		background: #080a0c;
		box-shadow:
			0 24px 80px rgba(0, 0, 0, 0.55),
			inset 0 1px 0 rgba(255, 255, 255, 0.035);
	}
	:global(:root[data-theme='dark']) .ribbon,
	:global(:root[data-theme='dark']) .statusbar {
		background: rgba(13, 15, 18, 0.96);
	}
	:global(:root[data-theme='dark']) .button-row {
		background: #101318;
		border-color: rgba(255, 255, 255, 0.08);
	}
	:global(:root[data-theme='dark']) .surface-shell {
		background: #050607;
	}
	:global(:root[data-theme='dark']) .surface {
		background: #0a0c0e;
		border-color: rgba(255, 255, 255, 0.1);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.035),
			0 18px 54px rgba(0, 0, 0, 0.4);
	}
	:global(:root[data-theme='dark']) .surface :global(blockquote) {
		background: #11161b;
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
			position: sticky;
			top: 0;
			flex-wrap: nowrap;
			align-items: flex-end;
			overflow-x: auto;
			padding: var(--space-2);
			scrollbar-width: thin;
		}
		.ribbon-group,
		.ribbon-group.wide {
			width: auto;
			min-width: 0;
		}
		.ribbon-group.wide {
			min-width: 198px;
		}
		.group-label {
			display: none;
		}
		.ribbon-save {
			width: auto;
			min-width: 132px;
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
