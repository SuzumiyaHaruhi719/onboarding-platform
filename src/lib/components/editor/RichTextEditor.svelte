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
	let tick = $state(0); // bumped on every transaction to refresh toolbar state
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
			autofocus: 'end',
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
	function chain() {
		return editor!.chain().focus();
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
			err = '内容不能为空,请先输入文字';
			return;
		}
		onsave(md);
	}
</script>

<div class="rte">
	<div class="toolbar">
		<button type="button" class:on={active('heading', { level: 2 })} title="标题 H2" onclick={() => chain().toggleHeading({ level: 2 }).run()}>H2</button>
		<button type="button" class:on={active('heading', { level: 3 })} title="标题 H3" onclick={() => chain().toggleHeading({ level: 3 }).run()}>H3</button>
		<span class="sep"></span>
		<button type="button" class="b" class:on={active('bold')} title="加粗" onclick={() => chain().toggleBold().run()}>B</button>
		<button type="button" class="i" class:on={active('italic')} title="斜体" onclick={() => chain().toggleItalic().run()}>I</button>
		<button type="button" class="s" class:on={active('strike')} title="删除线" onclick={() => chain().toggleStrike().run()}>S</button>
		<button type="button" class="code" class:on={active('code')} title="行内代码" onclick={() => chain().toggleCode().run()}>{'</>'}</button>
		<span class="sep"></span>
		<button type="button" class="ico" class:on={active('bulletList')} title="无序列表" aria-label="无序列表" onclick={() => chain().toggleBulletList().run()}><Icon name="list" size={16} /></button>
		<button type="button" class="ico" class:on={active('orderedList')} title="有序列表" aria-label="有序列表" onclick={() => chain().toggleOrderedList().run()}><Icon name="list-ordered" size={16} /></button>
		<button type="button" class="ico" class:on={active('blockquote')} title="引用" aria-label="引用" onclick={() => chain().toggleBlockquote().run()}><Icon name="text-quote" size={16} /></button>
		<button type="button" class="ico" class:on={active('link')} title="链接" aria-label="链接" onclick={openLinkPanel}><Icon name="link" size={16} /></button>
	</div>

	{#if linkOpen}
		<div class="link-panel">
			<label>
				<span>链接 URL</span>
				<input
					type="url"
					placeholder="https://example.com"
					bind:value={linkUrl}
					onkeydown={onLinkKey}
				/>
			</label>
			<button type="button" class="mini primary" onclick={applyLink}>应用</button>
			<button type="button" class="mini" onclick={clearLink}>清除</button>
		</div>
	{/if}

	<div class="surface" bind:this={element}></div>

	<div class="actions">
		<button class="btn primary" onclick={save}>保存</button>
		<button class="btn ghost" onclick={oncancel}>取消</button>
		{#if err}
			<span class="err" role="alert">{err}</span>
		{:else}
			<span class="tip">支持 Markdown:**粗体**、## 标题、- 列表、&gt; 引用…</span>
		{/if}
	</div>
</div>

<style>
	.rte {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		background: var(--surface-elevated);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-wrap: wrap;
		padding: var(--space-3);
		border-bottom: 1px solid var(--border-default);
		background: var(--surface-subtle);
	}
	.toolbar button {
		min-width: 34px;
		height: 34px;
		padding: 0 var(--space-2);
		border: 1px solid transparent;
		background: transparent;
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		cursor: pointer;
		transition: var(--transition-fast);
	}
	.toolbar button:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.toolbar button.on {
		background: var(--brand-50);
		border-color: var(--brand-200);
		color: var(--text-brand);
	}
	.toolbar button.ico {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.toolbar .b {
		font-weight: 800;
	}
	.toolbar .i {
		font-style: italic;
	}
	.toolbar .s {
		text-decoration: line-through;
	}
	.toolbar .code {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.sep {
		width: 1px;
		height: 18px;
		background: var(--border-default);
		margin: 0 var(--space-1);
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
		font-weight: 600;
		cursor: pointer;
	}
	.mini.primary {
		border-color: var(--brand-500);
		background: var(--brand-500);
		color: var(--text-inverse);
	}
	.surface {
		padding: var(--space-6) var(--space-8);
		min-height: 260px;
		max-height: 58vh;
		overflow-y: auto;
		background: var(--surface-elevated);
	}
	.surface :global(.ProseMirror) {
		outline: none;
		color: var(--text-primary);
		line-height: 1.75;
		max-width: 72ch;
	}
	.surface :global(.ProseMirror:focus) {
		outline: none;
	}
	.surface :global(h2) {
		font-size: var(--text-2xl);
		font-weight: 800;
		color: var(--text-primary);
		margin: var(--space-4) 0 var(--space-2);
		letter-spacing: 0;
	}
	.surface :global(h3) {
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--text-primary);
		margin: var(--space-3) 0 var(--space-2);
	}
	.surface :global(p) {
		margin: 0 0 var(--space-3);
	}
	.surface :global(ul),
	.surface :global(ol) {
		padding-left: var(--space-6);
		margin: 0 0 var(--space-3);
	}
	.surface :global(blockquote) {
		border-left: 3px solid var(--brand-500);
		background: var(--surface-subtle);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		margin: 0 0 var(--space-3);
		font-style: italic;
		color: var(--text-primary);
	}
	.surface :global(a) {
		color: var(--text-brand);
		text-decoration: underline;
	}
	.surface :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
		background: var(--surface-subtle);
		padding: 1px 5px;
		border-radius: var(--radius-sm);
	}
	.actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding: var(--space-4);
		border-top: 1px solid var(--border-default);
		background: var(--surface-page);
	}
	.btn {
		min-height: 40px;
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
	.btn.ghost {
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		color: var(--text-secondary);
	}
	.btn.ghost:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.tip {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		margin-left: auto;
	}
	.err {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--error);
		margin-left: auto;
	}
</style>
