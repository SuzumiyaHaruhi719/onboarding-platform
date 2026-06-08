<script lang="ts">
	import EditableSection from '$lib/components/EditableSection.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LearnerReader from '$lib/components/LearnerReader.svelte';
	import { useI18n } from '$lib/i18n/context';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const i18n = useI18n();
	const tx = (zh: string, en: string): string => (i18n().lang === 'zh' ? zh : en);
	const editorPreview = $derived(data.role === 'editor' && data.viewRole === 'learner');
</script>

{#if data.viewRole === 'editor'}
	{#key data.section.id}
		<EditableSection section={data.section} quizzes={data.editorQuizzes ?? []} modules={data.modules} />
	{/key}
{:else}
	{#if editorPreview}
		<div class="preview-exit" role="status" aria-label={tx('真实学生视图预览', 'Live learner preview')}>
			<div>
				<span class="preview-kicker">{tx('真实学生视图', 'Live learner view')}</span>
				<strong>{tx('你正在以学员身份预览这一节', 'You are previewing this section as a learner')}</strong>
			</div>
			<a class="back-edit" href={`/learn/${data.section.id}`}>
				<Icon name="square-pen" size={16} />
				{tx('返回编辑', 'Back to editor')}
			</a>
		</div>
	{/if}
	<LearnerReader section={data.section} />
{/if}

<style>
	.preview-exit {
		position: sticky;
		top: 56px;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-5);
		border-bottom: 1px solid var(--border-subtle);
		background:
			linear-gradient(90deg, var(--accent-blue-bg), transparent 58%),
			rgba(255, 255, 255, 0.92);
		backdrop-filter: blur(12px);
		box-shadow: var(--shadow-sm);
	}
	.preview-kicker {
		display: block;
		margin-bottom: 2px;
		color: var(--accent-blue);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 800;
		letter-spacing: 0.05em;
	}
	.preview-exit strong {
		color: var(--text-primary);
		font-size: var(--text-sm);
	}
	.back-edit {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-height: 40px;
		padding: 0 var(--space-4);
		border: 1px solid var(--accent-blue);
		border-radius: var(--radius-full);
		background: var(--accent-blue);
		color: white;
		font-weight: 800;
		font-size: var(--text-sm);
		text-decoration: none;
		box-shadow: 0 10px 24px color-mix(in srgb, var(--accent-blue) 24%, transparent);
		transition: var(--transition-fast);
	}
	.back-edit:hover {
		background: color-mix(in srgb, var(--accent-blue) 82%, black);
		transform: translateY(-1px);
	}
	:global(:root[data-theme='dark']) .preview-exit {
		background:
			linear-gradient(90deg, var(--accent-blue-bg), transparent 58%),
			rgba(5, 6, 7, 0.9);
		border-bottom-color: color-mix(in srgb, var(--accent-blue) 20%, rgba(255, 255, 255, 0.1));
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.035),
			0 18px 42px rgba(0, 0, 0, 0.3);
	}
	@media (max-width: 640px) {
		.preview-exit {
			position: static;
			align-items: stretch;
			flex-direction: column;
			padding: var(--space-3);
		}
		.back-edit {
			width: 100%;
		}
	}
</style>
