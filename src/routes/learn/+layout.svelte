<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const orderedIds = $derived(data.modules.flatMap((m) => m.sections.map((s) => s.id)));
</script>

<div class="three">
	<Sidebar modules={data.modules} progress={data.progress} {orderedIds} />
	<div class="center">
		{@render children()}
	</div>
</div>

<style>
	.three {
		display: grid;
		grid-template-columns: 240px 1fr;
		align-items: start;
	}
	.center {
		min-width: 0;
		background: var(--surface-page);
	}
	@media (max-width: 768px) {
		.three {
			grid-template-columns: 1fr;
		}
	}
</style>
