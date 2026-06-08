<script lang="ts">
	let {
		variant,
		title,
		body
	}: { variant: 'info' | 'success' | 'warning' | 'error'; title: string; body: string } = $props();
</script>

<div class="callout {variant}">
	<strong>{title}</strong>
	<p>{body}</p>
</div>

<style>
	.callout {
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		border: 1px solid;
		margin: 0 0 var(--space-4);
	}
	.callout strong {
		font-size: var(--text-sm);
		font-weight: 700;
	}
	.callout p {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}
	.info {
		background: var(--info-bg);
		border-color: var(--info);
	}
	.info strong {
		color: var(--info);
	}
	.success {
		background: var(--success-bg);
		border-color: var(--success);
	}
	.success strong {
		color: var(--success);
	}
	.warning {
		background: var(--warning-bg);
		border-color: var(--warning);
	}
	.warning strong {
		color: var(--warning);
	}
	.error {
		background: var(--error-bg);
		border-color: var(--error);
	}
	.error strong {
		color: var(--error);
	}
</style>
