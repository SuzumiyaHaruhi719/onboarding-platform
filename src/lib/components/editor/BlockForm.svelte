<script lang="ts">
	import { untrack } from 'svelte';
	import type { Block, BlockInput } from '$lib/content/types';

	let {
		initial,
		presetType,
		onsave,
		oncancel
	}: {
		initial?: Block;
		presetType?: BlockInput['type'];
		onsave: (block: BlockInput) => void;
		oncancel: () => void;
	} = $props();

	type BType = BlockInput['type'];
	const TYPES: { value: BType; label: string }[] = [
		{ value: 'heading', label: '标题' },
		{ value: 'paragraph', label: '正文段落' },
		{ value: 'list', label: '列表' },
		{ value: 'quote', label: '引用' },
		{ value: 'callout', label: '提示框' },
		{ value: 'image', label: '图片' },
		{ value: 'video', label: '视频' },
		{ value: 'quiz', label: '题目占位(在下方题库出题)' }
	];

	// Snapshot the prop once (forms are created fresh per edit); avoids reactive
	// re-init and the state_referenced_locally warning.
	const init = untrack(() => initial);
	const preset = untrack(() => presetType);
	let type = $state<BType>(init?.type ?? preset ?? 'paragraph');
	let text = $state(init && 'text' in init ? init.text : '');
	let level = $state<2 | 3>(init?.type === 'heading' ? init.level : 2);
	let ordered = $state(init?.type === 'list' ? init.ordered : false);
	let itemsText = $state(init?.type === 'list' ? init.items.join('\n') : '');
	let cite = $state(init?.type === 'quote' ? (init.cite ?? '') : '');
	let variant = $state<'info' | 'success' | 'warning' | 'error'>(
		init?.type === 'callout' ? init.variant : 'info'
	);
	let title = $state(init?.type === 'callout' ? init.title : '');
	let body = $state(init?.type === 'callout' ? init.body : '');
	let src = $state(init?.type === 'image' || init?.type === 'video' ? init.src : '');
	let alt = $state(init?.type === 'image' ? init.alt : '');
	let caption = $state(init?.type === 'image' ? (init.caption ?? '') : '');
	let durationSec = $state(init?.type === 'video' ? init.durationSec : 10);
	let poster = $state(init?.type === 'video' ? (init.poster ?? '') : '');
	let err = $state('');

	function build(): BlockInput | null {
		switch (type) {
			case 'heading':
				return text.trim() ? { type, level, text: text.trim() } : null;
			case 'paragraph':
				return text.trim() ? { type, text: text.trim() } : null;
			case 'list': {
				const items = itemsText.split('\n').map((s) => s.trim()).filter(Boolean);
				return items.length ? { type, ordered, items } : null;
			}
			case 'quote':
				return text.trim() ? { type, text: text.trim(), cite: cite.trim() || undefined } : null;
			case 'callout':
				return title.trim() ? { type, variant, title: title.trim(), body: body.trim() } : null;
			case 'image':
				return src.trim() ? { type, src: src.trim(), alt: alt.trim(), caption: caption.trim() || undefined } : null;
			case 'video':
				return src.trim() && durationSec > 0
					? { type, src: src.trim(), durationSec: Number(durationSec), poster: poster.trim() || undefined }
					: null;
			case 'quiz':
				return { type };
			default:
				return null; // richtext is handled by RichTextEditor, not this form
		}
	}

	function save(): void {
		const b = build();
		if (!b) {
			err = '请填写必填字段';
			return;
		}
		onsave(b);
	}
</script>

<div class="form">
	<label class="row">
		<span>类型</span>
		<select bind:value={type}>
			{#each TYPES as t (t.value)}<option value={t.value}>{t.label}</option>{/each}
		</select>
	</label>

	{#if type === 'heading'}
		<label class="row">
			<span>级别</span>
			<select bind:value={level}>
				<option value={2}>H2</option>
				<option value={3}>H3</option>
			</select>
		</label>
		<input class="inp" placeholder="标题文字" bind:value={text} />
	{:else if type === 'paragraph'}
		<textarea class="inp" rows="4" placeholder="正文内容" bind:value={text}></textarea>
	{:else if type === 'list'}
		<label class="check"><input type="checkbox" bind:checked={ordered} /> 有序列表</label>
		<textarea class="inp" rows="4" placeholder="每行一个列表项" bind:value={itemsText}></textarea>
	{:else if type === 'quote'}
		<textarea class="inp" rows="3" placeholder="引用内容" bind:value={text}></textarea>
		<input class="inp" placeholder="出处(可选)" bind:value={cite} />
	{:else if type === 'callout'}
		<label class="row">
			<span>风格</span>
			<select bind:value={variant}>
				<option value="info">信息</option>
				<option value="success">成功</option>
				<option value="warning">警告</option>
				<option value="error">错误</option>
			</select>
		</label>
		<input class="inp" placeholder="标题" bind:value={title} />
		<textarea class="inp" rows="2" placeholder="内容" bind:value={body}></textarea>
	{:else if type === 'image'}
		<input class="inp" placeholder="图片 URL" bind:value={src} />
		<input class="inp" placeholder="替代文字 alt" bind:value={alt} />
		<input class="inp" placeholder="图注(可选)" bind:value={caption} />
	{:else if type === 'video'}
		<input class="inp" placeholder="视频 URL(或用上方上传)" bind:value={src} />
		<input class="inp" type="number" min="1" placeholder="时长(秒)" bind:value={durationSec} />
		<input class="inp" placeholder="封面 URL(可选)" bind:value={poster} />
	{:else if type === 'quiz'}
		<p class="hint">题目占位块:学员阅读到此处时显示本节题目。题目在页面下方"题库"中维护。</p>
	{/if}

	{#if err}<p class="err">{err}</p>{/if}
	<div class="actions">
		<button class="btn-primary" onclick={save}>保存块</button>
		<button class="btn-ghost" onclick={oncancel}>取消</button>
	</div>
</div>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-page);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.row span {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		min-width: 48px;
	}
	.inp,
	select,
	textarea {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-elevated);
		color: var(--text-primary);
		font-size: var(--text-sm);
		font-family: inherit;
	}
	select {
		width: auto;
	}
	textarea {
		resize: vertical;
	}
	.inp:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: var(--brand-500);
		box-shadow: 0 0 0 3px var(--brand-200);
	}
	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}
	.hint {
		font-size: var(--text-sm);
		color: var(--text-tertiary);
		margin: 0;
	}
	.err {
		color: var(--error);
		font-size: var(--text-sm);
		margin: 0;
	}
	.actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.btn-primary {
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-lg);
		background: var(--brand-500);
		color: var(--text-inverse);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.btn-ghost {
		padding: var(--space-2) var(--space-4);
		border: none;
		background: transparent;
		color: var(--text-tertiary);
		cursor: pointer;
		font-size: var(--text-sm);
	}
</style>
