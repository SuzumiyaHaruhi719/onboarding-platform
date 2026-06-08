<script lang="ts">
	import EditableSection from '$lib/components/EditableSection.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LearnerReader from '$lib/components/LearnerReader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const editorPreview = $derived(data.role === 'editor' && data.viewRole === 'learner');
</script>

{#if data.viewRole === 'editor'}
	{#key data.section.id}
		<EditableSection section={data.section} quizzes={data.editorQuizzes ?? []} modules={data.modules} />
	{/key}
{:else}
	{#if editorPreview}
		<div class="preview-exit" role="status" aria-label="真实学生视图预览">
			<div>
				<span class="preview-kicker">真实学生视图</span>
				<strong>你正在以学员身份预览这一节</strong>
			</div>
			<a class="back-edit" href={`/learn/${data.section.id}`}>
				<Icon name="square-pen" size={16} />
				返回编辑
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
		background: rgba(255, 255, 255, 0.92);
		backdrop-filter: blur(12px);
		box-shadow: var(--shadow-sm);
	}
	.preview-kicker {
		display: block;
		margin-bottom: 2px;
		color: var(--text-brand);
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
		border: 1px solid var(--brand-300);
		border-radius: var(--radius-full);
		background: var(--brand-500);
		color: white;
		font-weight: 800;
		font-size: var(--text-sm);
		text-decoration: none;
		box-shadow: 0 10px 24px rgba(10, 167, 89, 0.22);
		transition: var(--transition-fast);
	}
	.back-edit:hover {
		background: var(--brand-600);
		transform: translateY(-1px);
	}
	:global(:root[data-theme='dark']) .preview-exit {
		background: rgba(5, 6, 7, 0.9);
		border-bottom-color: rgba(255, 255, 255, 0.1);
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
