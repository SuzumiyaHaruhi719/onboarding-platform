<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { useI18n } from '$lib/i18n/context';

	const i18n = useI18n();
	const isLocked = $derived(page.status === 403);
	const isMissing = $derived(page.status === 404);
	const title = $derived(
		isLocked ? '本节尚未解锁' : isMissing ? '页面不存在' : '页面暂时不可用'
	);
	const body = $derived(
		isLocked
			? '请先从学习入口继续当前进度，系统会自动带你进入下一节可学习内容。'
			: isMissing
				? '这个链接可能已经失效，返回入口后可以重新选择学习或编辑工作区。'
				: '请回到入口重试。如果问题持续出现，再检查当前课程内容或服务状态。'
	);
	const primaryHref = $derived(isLocked ? '/learn' : '/');
	const primaryText = $derived(isLocked ? '继续学习' : '返回入口');
</script>

<svelte:head>
	<title>{page.status} · {i18n().t('app.title')}</title>
</svelte:head>

<section class="error-state" aria-labelledby="error-title">
	<div class="status-badge">
		<Icon name={isLocked ? 'lock' : 'info'} size={20} />
		<span>{page.status}</span>
	</div>
	<h1 id="error-title">{title}</h1>
	<p>{body}</p>
	<div class="actions">
		<a class="primary" href={primaryHref}>
			{primaryText}
			<Icon name="arrow-right" size={16} />
		</a>
		<a class="secondary" href="/">切换身份</a>
	</div>
</section>

<style>
	.error-state {
		width: min(100%, 680px);
		margin: 0 auto;
		padding: var(--space-24) var(--content-padding-x);
		display: flex;
		min-height: calc(100vh - 56px);
		flex-direction: column;
		justify-content: center;
		align-items: flex-start;
		gap: var(--space-4);
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-elevated);
		color: var(--text-brand);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: 700;
	}

	h1 {
		margin: 0;
		color: var(--text-primary);
		font-size: var(--text-3xl);
		line-height: 1.15;
		font-weight: 800;
		letter-spacing: 0;
	}

	p {
		margin: 0;
		max-width: 560px;
		color: var(--text-secondary);
		font-size: var(--text-lg);
		line-height: 1.75;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-top: var(--space-4);
	}

	.primary,
	.secondary {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: 0 var(--space-4);
		border-radius: var(--radius-lg);
		font-size: var(--text-sm);
		font-weight: 700;
		text-decoration: none;
	}

	.primary {
		background: var(--brand-500);
		color: var(--text-inverse);
		box-shadow: var(--shadow-sm);
	}

	.secondary {
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		color: var(--text-secondary);
	}

	@media (max-width: 640px) {
		.error-state {
			padding-top: var(--space-16);
			justify-content: flex-start;
		}

		h1 {
			font-size: var(--text-2xl);
		}

		p {
			font-size: var(--text-base);
		}

		.actions,
		.primary,
		.secondary {
			width: 100%;
		}
	}
</style>
