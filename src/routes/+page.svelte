<script lang="ts">
	import { goto } from '$app/navigation';
	import { useI18n } from '$lib/i18n/context';

	const i18n = useI18n();
	let busy = $state(false);

	async function pick(role: 'learner' | 'editor'): Promise<void> {
		busy = true;
		await fetch('/api/role', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ role })
		}).catch(() => {});
		await goto('/learn');
	}
</script>

<section class="pick">
	<h1>{i18n().t('role.pick')}</h1>
	<p class="sub">{i18n().t('role.pick.sub')}</p>

	<div class="cards">
		<button class="role-card" onclick={() => pick('learner')} disabled={busy}>
			<span class="emoji">🎓</span>
			<h3>{i18n().t('role.learner')}</h3>
			<p>{i18n().t('role.learner.desc')}</p>
		</button>
		<button class="role-card" onclick={() => pick('editor')} disabled={busy}>
			<span class="emoji">✍️</span>
			<h3>{i18n().t('role.editor')}</h3>
			<p>{i18n().t('role.editor.desc')}</p>
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
	h1 {
		font-size: var(--text-3xl);
		color: var(--text-primary);
		margin: 0 0 var(--space-2);
	}
	.sub {
		color: var(--text-tertiary);
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
		box-shadow: var(--shadow-md);
		transform: translateY(-2px);
		border-color: var(--border-strong);
	}
	.role-card:disabled {
		opacity: 0.6;
		cursor: progress;
	}
	.emoji {
		font-size: 36px;
	}
	.role-card h3 {
		color: var(--text-primary);
		margin: var(--space-2) 0 0;
	}
	.role-card p {
		color: var(--text-tertiary);
		font-size: var(--text-sm);
		margin: 0;
	}
	@media (max-width: 640px) {
		.cards {
			grid-template-columns: 1fr;
		}
	}
</style>
