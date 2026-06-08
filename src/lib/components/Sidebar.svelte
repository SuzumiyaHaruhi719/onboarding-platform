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
		background: var(--surface-container);
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
		min-height: 42px;
		padding: var(--space-2) var(--space-3);
		border: 1px solid transparent;
		border-radius: var(--radius-lg);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		text-decoration: none;
		transition: var(--transition-fast);
	}
	a.navitem:hover {
		border-color: var(--border-subtle);
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.navitem.active {
		border-color: var(--border-default);
		background: var(--surface-elevated);
		color: var(--text-primary);
		box-shadow: var(--shadow-sm);
	}
	.navitem.locked {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.ic {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex: none;
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		color: var(--text-tertiary);
	}
	.navitem.active .ic {
		background: var(--brand-50);
		border: 1px solid var(--brand-200);
		color: var(--text-brand);
	}
	:global(:root[data-theme='dark']) .sidebar {
		background: linear-gradient(180deg, #090b0d 0%, #060708 100%);
		box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.025);
	}
	:global(:root[data-theme='dark']) .navitem {
		background: rgba(255, 255, 255, 0.012);
	}
	:global(:root[data-theme='dark']) .navitem.active {
		border-color: rgba(47, 212, 122, 0.34);
		background:
			linear-gradient(180deg, rgba(47, 212, 122, 0.075), rgba(47, 212, 122, 0.025)),
			#0a0c0e;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.045),
			0 10px 28px rgba(0, 0, 0, 0.28);
	}
	:global(:root[data-theme='dark']) .ic {
		background: #12161b;
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
