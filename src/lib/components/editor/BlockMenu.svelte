<script lang="ts">
	import type { BlockInput } from '$lib/content/types';

	let { onpick, onclose }: { onpick: (type: BlockInput['type']) => void; onclose: () => void } =
		$props();

	const TYPES: { type: BlockInput['type']; icon: string; label: string; desc: string }[] = [
		{ type: 'paragraph', icon: '¶', label: '正文', desc: '普通段落文字' },
		{ type: 'heading', icon: 'H', label: '标题', desc: '小节标题(H2/H3)' },
		{ type: 'list', icon: '☰', label: '列表', desc: '有序或无序列表' },
		{ type: 'callout', icon: '!', label: '提示框', desc: '信息 / 警告 / 成功' },
		{ type: 'quote', icon: '❝', label: '引用', desc: '引用语句' },
		{ type: 'image', icon: '🖼', label: '图片', desc: '插入图片 URL' },
		{ type: 'video', icon: '🎬', label: '视频', desc: '上传或粘贴视频' },
		{ type: 'quiz', icon: '✓', label: '题目', desc: '在此处展示本节题目' }
	];

	function onKey(e: KeyboardEvent): void {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="menu-bg" role="presentation" onclick={onclose}></div>
<div class="menu" role="menu" aria-label="选择内容块类型">
	<div class="menu-title">添加内容块</div>
	{#each TYPES as t (t.type)}
		<button class="menu-item" role="menuitem" onclick={() => onpick(t.type)}>
			<span class="ic">{t.icon}</span>
			<span class="txt">
				<span class="lbl">{t.label}</span>
				<span class="desc">{t.desc}</span>
			</span>
		</button>
	{/each}
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
		top: calc(100% + 4px);
		left: 0;
		width: 260px;
		max-height: 360px;
		overflow-y: auto;
		background: var(--surface-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-lg);
		padding: var(--space-2);
	}
	.menu-title {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
		padding: var(--space-1) var(--space-2) var(--space-2);
	}
	.menu-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-2);
		border: none;
		background: transparent;
		border-radius: var(--radius-md);
		cursor: pointer;
		text-align: left;
		transition: var(--transition-fast);
	}
	.menu-item:hover {
		background: var(--surface-hover);
	}
	.ic {
		flex: none;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		background: var(--brand-50);
		border: 1px solid var(--brand-200);
		color: var(--text-brand);
		font-weight: 700;
		font-size: var(--text-base);
	}
	.txt {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.lbl {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-primary);
	}
	.desc {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
	}
</style>
