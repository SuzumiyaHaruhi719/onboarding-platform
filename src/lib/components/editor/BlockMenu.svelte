<script lang="ts">
	import { scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import type { BlockInput } from '$lib/content/types';
	import Icon from '$lib/components/Icon.svelte';
	import { useI18n } from '$lib/i18n/context';

	let { onpick, onclose }: { onpick: (type: BlockInput['type']) => void; onclose: () => void } =
		$props();

	const i18n = useI18n();
	const tx = (zh: string, en: string): string => (i18n().lang === 'zh' ? zh : en);

	const TYPES: { type: BlockInput['type']; icon: string; label: () => string; desc: () => string }[] = [
		{ type: 'richtext', icon: 'file-text', label: () => tx('图文正文', 'Rich text'), desc: () => tx('适合大多数课程内容', 'Best for most course content') },
		{ type: 'callout', icon: 'info', label: () => tx('重点提示', 'Callout'), desc: () => tx('放安全提醒、注意事项、结论', 'Safety notes, warnings, or conclusions') },
		{ type: 'image', icon: 'image', label: () => tx('图片说明', 'Image'), desc: () => tx('图片加替代文本和图注', 'Image with alt text and caption') },
		{ type: 'video', icon: 'video', label: () => tx('视频片段', 'Video'), desc: () => tx('上传或粘贴视频地址', 'Upload or paste a video URL') },
		{ type: 'quiz', icon: 'circle-check', label: () => tx('检查题', 'Quiz'), desc: () => tx('学生答对后继续学习', 'Learners continue after passing') }
	];

	function onKey(e: KeyboardEvent): void {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="menu-bg" role="presentation" onclick={onclose}></div>
<div
	class="menu"
	role="menu"
	aria-label={tx('选择内容块类型', 'Choose content block type')}
	transition:scale={{ start: 0.95, opacity: 0, duration: 150, easing: cubicOut }}
	style="transform-origin: top left;"
>
	<div class="menu-title">{tx('添加内容块', 'Add content block')}</div>
	<div class="menu-grid">
		{#each TYPES as t (t.type)}
			<button class="menu-item" role="menuitem" onclick={() => onpick(t.type)}>
				<span class="ic"><Icon name={t.icon} size={18} /></span>
				<span class="txt">
					<span class="lbl">{t.label()}</span>
					<span class="desc">{t.desc()}</span>
				</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.menu-bg {
		position: fixed;
		inset: 0;
		z-index: 60;
	}
	.menu {
		position: absolute;
		z-index: 61;
		top: calc(100% + 8px);
		left: 0;
		width: min(420px, calc(100vw - 32px));
		max-height: 70vh;
		overflow-y: auto;
		background: var(--surface-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-lg);
		padding: var(--space-3);
	}
	.menu-title {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
		padding: 0 var(--space-1) var(--space-2);
	}
	.menu-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-2);
	}
	.menu-item {
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr);
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		min-height: 64px;
		padding: var(--space-3);
		border: 1px solid var(--border-subtle);
		background: var(--surface-container);
		border-radius: var(--radius-lg);
		cursor: pointer;
		text-align: left;
		transition: var(--transition-fast);
	}
	.menu-item:hover,
	.menu-item:focus-visible {
		outline: none;
		border-color: var(--brand-500);
		background: var(--surface-hover);
	}
	.ic {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-lg);
		background: var(--brand-50);
		border: 1px solid var(--brand-200);
		color: var(--text-brand);
	}
	.txt {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.lbl {
		font-size: var(--text-sm);
		font-weight: 800;
		color: var(--text-primary);
	}
	.desc {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		line-height: 1.45;
	}
</style>
