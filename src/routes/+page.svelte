<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { useI18n } from '$lib/i18n/context';
	import Icon from '$lib/components/Icon.svelte';

	const i18n = useI18n();
	let busy = $state(false);

	async function pick(role: 'learner' | 'editor'): Promise<void> {
		busy = true;
		await fetch('/api/role', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ role })
		}).catch(() => {});
		// Refresh cached layout data so role-dependent views update immediately.
		await invalidateAll();
		await goto(role === 'editor' ? '/editor' : '/learn');
	}
</script>

<section class="pick">
	<p class="eyebrow rise-in"><span class="dot"></span>{i18n().t('app.title')}</p>
	<h1 class="rise-in" style="animation-delay: 60ms">{i18n().t('role.pick')}</h1>
	<p class="sub rise-in" style="animation-delay: 120ms">{i18n().t('role.pick.sub')}</p>

	<div class="cards">
		<button class="role-card rise-in" style="animation-delay: 190ms" onclick={() => pick('learner')} disabled={busy}>
			<span class="chip"><Icon name="graduation-cap" size={28} /></span>
			<h3>{i18n().t('role.learner')}</h3>
			<p>{i18n().t('role.learner.desc')}</p>
			<span class="go">{i18n().t('learn.continue')} <Icon name="arrow-right" size={16} /></span>
		</button>
		<button class="role-card rise-in" style="animation-delay: 250ms" onclick={() => pick('editor')} disabled={busy}>
			<span class="chip"><Icon name="square-pen" size={28} /></span>
			<h3>{i18n().t('role.editor')}</h3>
			<p>{i18n().t('role.editor.desc')}</p>
			<span class="go">{i18n().t('learn.continue')} <Icon name="arrow-right" size={16} /></span>
		</button>
	</div>
</section>

<style>
	.pick {
		max-width: 720px;
		margin: 0 auto;
		padding: var(--space-24) var(--content-padding-x);
		text-align: center;
	}
	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-brand);
		margin: 0 0 var(--space-4);
	}
	.eyebrow .dot {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--brand-500);
	}
	h1 {
		font-size: var(--text-4xl);
		font-weight: 800;
		letter-spacing: 0;
		color: var(--text-primary);
		margin: 0 0 var(--space-3);
	}
	.sub {
		color: var(--text-tertiary);
		font-size: var(--text-lg);
		margin: 0 0 var(--space-12);
	}
	.cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-6);
	}
	.role-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-10) var(--space-6);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-2xl);
		background: var(--surface-elevated);
		box-shadow: var(--shadow-sm);
		cursor: pointer;
		transition: var(--transition-base);
		text-align: center;
	}
	.role-card:hover:not(:disabled) {
		box-shadow: var(--shadow-lg);
		transform: translateY(-3px);
		border-color: var(--border-strong);
	}
	.role-card:disabled {
		opacity: 0.6;
		cursor: progress;
	}
	.chip {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: var(--radius-full);
		background: var(--brand-50);
		border: 1px solid var(--brand-200);
		color: var(--text-brand);
		margin-bottom: var(--space-2);
		transition: transform var(--transition-base);
	}
	.role-card:hover:not(:disabled) .chip {
		transform: scale(1.08);
	}
	.role-card h3 {
		font-size: var(--text-xl);
		color: var(--text-primary);
		margin: 0;
	}
	.role-card p {
		color: var(--text-tertiary);
		font-size: var(--text-sm);
		margin: 0;
	}
	.go {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-top: var(--space-3);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-brand);
		opacity: 0;
		transform: translateY(4px);
		transition: var(--transition-base);
	}
	.go :global(.icon) {
		transition: transform var(--transition-base);
	}
	.role-card:hover:not(:disabled) .go {
		opacity: 1;
		transform: translateY(0);
	}
	.role-card:hover:not(:disabled) .go :global(.icon) {
		transform: translateX(3px);
	}
	@media (max-width: 640px) {
		.cards {
			grid-template-columns: 1fr;
		}
		.go {
			opacity: 1;
			transform: none;
		}
	}
</style>
