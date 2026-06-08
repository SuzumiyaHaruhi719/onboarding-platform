<script lang="ts">
	import EditableSection from '$lib/components/EditableSection.svelte';
	import LearnerReader from '$lib/components/LearnerReader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

{#if data.role === 'editor'}
	{#key data.section.id}
		<EditableSection section={data.section} quizzes={data.editorQuizzes ?? []} modules={data.modules} />
	{/key}
{:else}
	<LearnerReader section={data.section} />
{/if}
