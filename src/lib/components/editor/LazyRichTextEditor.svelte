<script lang="ts">
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';
	import { useI18n } from '$lib/i18n/context';

	let {
		initial,
		onsave,
		oncancel
	}: {
		initial?: string;
		onsave: (markdown: string) => void;
		oncancel: () => void;
	} = $props();

	let Editor = $state<Component<{
		initial?: string;
		onsave: (markdown: string) => void;
		oncancel: () => void;
	}> | null>(null);
	const i18n = useI18n();
	const tx = (zh: string, en: string): string => (i18n().lang === 'zh' ? zh : en);

	onMount(async () => {
		Editor = (await import('./RichTextEditor.svelte')).default;
	});
</script>

{#if Editor}
	<Editor {initial} {onsave} {oncancel} />
{:else}
	<div class="loading" role="status">{tx('加载富文本编辑器…', 'Loading rich text editor...')}</div>
{/if}

<style>
	.loading {
		padding: var(--space-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-page);
		color: var(--text-tertiary);
		font-size: var(--text-sm);
	}
</style>
