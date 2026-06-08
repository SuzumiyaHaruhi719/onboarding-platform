<script lang="ts">
	import { page } from '$app/state';
	import type { ModuleWithSections } from '$lib/db/queries';

	let {
		modules,
		progress,
		orderedIds
	}: {
		modules: ModuleWithSections[];
		progress: Record<string, string>;
		orderedIds: string[];
	} = $props();

	function isUnlocked(id: string): boolean {
		const i = orderedIds.indexOf(id);
		if (i <= 0) return true;
		return progress[orderedIds[i - 1]!] === 'completed';
	}
</script>

<aside class="sidebar">
	{#each modules as m (m.id)}
		<div class="mod">{m.title}</div>
		{#each m.sections as s (s.id)}
			{@const done = progress[s.id] === 'completed'}
			{@const open = isUnlocked(s.id)}
			{#if open}
				<a class="navitem" class:active={page.params.sectionId === s.id} href={`/learn/${s.id}`}>
					<span class="ic" class:done>{done ? '✓' : '▸'}</span>
					<span class="title">{s.title}</span>
				</a>
			{:else}
				<span class="navitem locked" aria-disabled="true">
					<span class="ic">🔒</span>
					<span class="title">{s.title}</span>
				</span>
			{/if}
		{/each}
	{/each}
</aside>

<style>
	.sidebar {
		width: 240px;
		flex: none;
		background: var(--surface-elevated);
		border-right: 1px solid var(--border-subtle);
		padding: var(--space-4);
		overflow-y: auto;
	}
	.mod {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
		margin: var(--space-4) 0 var(--space-2);
	}
	.mod:first-child {
		margin-top: 0;
	}
	.navitem {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-lg);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		text-decoration: none;
		transition: var(--transition-fast);
	}
	a.navitem:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.navitem.active {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.navitem.locked {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.ic {
		width: 18px;
		text-align: center;
		flex: none;
	}
	.ic.done {
		color: var(--brand-500);
	}
	.title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
