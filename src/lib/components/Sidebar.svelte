<script lang="ts">
	import { page } from '$app/state';
	import type { ModuleWithSections } from '$lib/db/queries';
	import Icon from '$lib/components/Icon.svelte';

	let {
		modules,
		progress,
		orderedIds,
		editable = false
	}: {
		modules: ModuleWithSections[];
		progress: Record<string, string>;
		orderedIds: string[];
		editable?: boolean;
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
			{@const open = editable || isUnlocked(s.id)}
			{#if open}
				<a class="navitem" class:active={page.params.sectionId === s.id} href={`/learn/${s.id}`}>
					{#if editable}
						<span class="ic"><Icon name="file-text" size={15} /></span>
					{:else}
						<span class="ic" class:done><Icon name={done ? 'circle-check' : 'circle'} size={16} /></span>
					{/if}
					<span class="title">{s.title}</span>
				</a>
			{:else}
				<span class="navitem locked" aria-disabled="true">
					<span class="ic"><Icon name="lock" size={15} /></span>
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
		position: sticky;
		top: 56px;
		height: calc(100vh - 56px);
		align-self: start;
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
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		flex: none;
		color: var(--text-tertiary);
	}
	.ic.done {
		color: var(--brand-500);
	}
	.title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 768px) {
		.sidebar {
			width: 100%;
			position: static;
			height: auto;
			max-height: none;
			display: flex;
			align-items: center;
			gap: var(--space-2);
			border-right: none;
			border-bottom: 1px solid var(--border-subtle);
			overflow-x: auto;
			overflow-y: hidden;
			scroll-snap-type: x proximity;
		}
		.mod {
			flex: none;
			margin: 0 var(--space-1) 0 0;
			max-width: 132px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.navitem {
			flex: none;
			min-height: 38px;
			scroll-snap-align: start;
			border: 1px solid transparent;
			background: var(--surface-page);
		}
		.navitem.active {
			border-color: var(--border-default);
		}
	}
</style>
