<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { Block, BlockInput } from '$lib/content/types';
	import { useI18n } from '$lib/i18n/context';

	let {
		initial,
		presetType,
		lockType = false,
		onsave,
		oncancel
	}: {
		initial?: Block;
		presetType?: BlockInput['type'];
		lockType?: boolean;
		onsave: (block: BlockInput) => void;
		oncancel: () => void;
	} = $props();

	type BType = Exclude<BlockInput['type'], 'richtext'>;
	const i18n = useI18n();
	const tx = (zh: string, en: string): string => (i18n().lang === 'zh' ? zh : en);
	const TYPES: { value: BType; label: () => string; icon: string; desc: () => string }[] = [
		{ value: 'heading', label: () => tx('小标题', 'Subheading'), icon: 'file-text', desc: () => tx('分隔一个主题', 'Separate a topic') },
		{ value: 'paragraph', label: () => tx('短正文', 'Paragraph'), icon: 'file-text', desc: () => tx('单段说明文字', 'Single explanatory paragraph') },
		{ value: 'list', label: () => tx('清单', 'List'), icon: 'list', desc: () => tx('步骤、规则、材料', 'Steps, rules, or materials') },
		{ value: 'quote', label: () => tx('引用', 'Quote'), icon: 'text-quote', desc: () => tx('制度原文或引语', 'Policy text or quotation') },
		{ value: 'callout', label: () => tx('提示框', 'Callout'), icon: 'info', desc: () => tx('重点、警告、结论', 'Key point, warning, or conclusion') },
		{ value: 'image', label: () => tx('图片', 'Image'), icon: 'image', desc: () => tx('配图和图注', 'Image and caption') },
		{ value: 'video', label: () => tx('视频', 'Video'), icon: 'video', desc: () => tx('视频地址和时长', 'Video URL and duration') }
	];

	const init = untrack(() => initial);
	const preset = untrack(() => presetType);
	let type = $state<BType>((init?.type === 'richtext' ? 'paragraph' : init?.type) ?? (preset === 'richtext' ? 'paragraph' : preset) ?? 'paragraph');
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

	function choose(next: BType): void {
		type = next;
		err = '';
	}

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
				return null;
		}
	}

	function save(): void {
		const b = build();
		if (!b) {
			err = tx('请填写必要内容', 'Please fill in the required content');
			return;
		}
		onsave(b);
	}
</script>

<div class="form">
	{#if !lockType}
		<div class="type-grid" role="listbox" aria-label={tx('内容类型', 'Content type')}>
			{#each TYPES as t (t.value)}
				<button
					type="button"
					class="type-card"
					class:on={type === t.value}
					role="option"
					aria-selected={type === t.value}
					onclick={() => choose(t.value)}
				>
					<span class="type-icon"><Icon name={t.icon} size={16} /></span>
					<span>
						<strong>{t.label()}</strong>
						<small>{t.desc()}</small>
					</span>
				</button>
			{/each}
		</div>
	{/if}

	<div class="fields">
		{#if type === 'heading'}
			<label class="row">
				<span>{tx('级别', 'Level')}</span>
				<div class="seg">
					<button type="button" class:on={level === 2} onclick={() => (level = 2)}>H2</button>
					<button type="button" class:on={level === 3} onclick={() => (level = 3)}>H3</button>
				</div>
			</label>
			<input class="inp" placeholder={tx('标题文字', 'Heading text')} bind:value={text} />
		{:else if type === 'paragraph'}
			<textarea class="inp" rows="4" placeholder={tx('正文内容', 'Body text')} bind:value={text}></textarea>
		{:else if type === 'list'}
			<label class="check"><input type="checkbox" bind:checked={ordered} /> {tx('有序列表', 'Numbered list')}</label>
			<textarea class="inp" rows="5" placeholder={tx('每行一个列表项', 'One list item per line')} bind:value={itemsText}></textarea>
		{:else if type === 'quote'}
			<textarea class="inp" rows="3" placeholder={tx('引用内容', 'Quote text')} bind:value={text}></textarea>
			<input class="inp" placeholder={tx('出处，可选', 'Source, optional')} bind:value={cite} />
		{:else if type === 'callout'}
			<label class="row">
				<span>{tx('风格', 'Style')}</span>
				<div class="seg">
					{#each ['info', 'success', 'warning', 'error'] as v}
						<button type="button" class:on={variant === v} onclick={() => (variant = v as typeof variant)}>
							{v === 'info' ? tx('信息', 'Info') : v === 'success' ? tx('成功', 'Success') : v === 'warning' ? tx('警告', 'Warning') : tx('错误', 'Error')}
						</button>
					{/each}
				</div>
			</label>
			<input class="inp" placeholder={tx('提示标题', 'Callout title')} bind:value={title} />
			<textarea class="inp" rows="3" placeholder={tx('提示内容', 'Callout body')} bind:value={body}></textarea>
		{:else if type === 'image'}
			<input class="inp" placeholder={tx('图片 URL', 'Image URL')} bind:value={src} />
			<input class="inp" placeholder={tx('替代文字 alt', 'Alt text')} bind:value={alt} />
			<input class="inp" placeholder={tx('图注，可选', 'Caption, optional')} bind:value={caption} />
		{:else if type === 'video'}
			<input class="inp" placeholder={tx('视频 URL，或使用顶部上传', 'Video URL, or use the upload button above')} bind:value={src} />
			<input class="inp" type="number" min="1" placeholder={tx('时长（秒）', 'Duration (seconds)')} bind:value={durationSec} />
			<input class="inp" placeholder={tx('封面 URL，可选', 'Poster URL, optional')} bind:value={poster} />
		{/if}
	</div>

	{#if err}<p class="err">{err}</p>{/if}
	<div class="actions">
		<button class="btn-primary" onclick={save}>{tx('保存内容块', 'Save block')}</button>
		<button class="btn-ghost" onclick={oncancel}>{tx('取消', 'Cancel')}</button>
	</div>
</div>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		background: var(--surface-container);
		box-shadow: var(--shadow-sm);
	}
	.type-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
		gap: var(--space-2);
	}
	.type-card {
		min-height: 72px;
		display: grid;
		grid-template-columns: 34px minmax(0, 1fr);
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background: var(--surface-elevated);
		color: var(--text-primary);
		text-align: left;
		cursor: pointer;
		transition: var(--transition-fast);
	}
	.type-card:hover,
	.type-card.on {
		border-color: var(--brand-500);
		background: var(--brand-50);
	}
	.type-icon {
		width: 34px;
		height: 34px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		color: var(--text-brand);
	}
	.type-card strong,
	.type-card small {
		display: block;
	}
	.type-card strong {
		font-size: var(--text-sm);
		font-weight: 800;
	}
	.type-card small {
		margin-top: var(--space-1);
		color: var(--text-tertiary);
		font-size: var(--text-xs);
		line-height: 1.35;
	}
	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.row span {
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--text-secondary);
	}
	.seg {
		display: inline-flex;
		padding: var(--space-1);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-elevated);
		gap: var(--space-1);
	}
	.seg button {
		min-height: 32px;
		padding: 0 var(--space-3);
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		font-weight: 700;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--brand-500);
		color: var(--text-inverse);
	}
	.inp,
	textarea {
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-elevated);
		color: var(--text-primary);
		font-size: var(--text-sm);
		font-family: inherit;
		line-height: 1.6;
	}
	textarea {
		resize: vertical;
	}
	.inp:focus,
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
	.err {
		color: var(--error);
		font-size: var(--text-sm);
		margin: 0;
	}
	.actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.btn-primary,
	.btn-ghost {
		min-height: 40px;
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-lg);
		font-weight: 800;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: var(--transition-fast);
	}
	.btn-primary {
		border: none;
		background: var(--brand-500);
		color: var(--text-inverse);
	}
	.btn-primary:hover {
		background: var(--brand-600);
	}
	.btn-ghost {
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		color: var(--text-secondary);
	}
	.btn-ghost:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
</style>
