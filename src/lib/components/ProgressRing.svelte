<script lang="ts">
	let { pct }: { pct: number } = $props();
	const clamped = $derived(Math.max(0, Math.min(1, pct)));
	const value = $derived(Math.round(clamped * 100));
	const R = 30;
	const CIRC = 2 * Math.PI * R;
	const offset = $derived(CIRC * (1 - clamped));
</script>

<div class="ring" role="img" aria-label={`${value}%`}>
	<svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
		<circle class="track" cx="36" cy="36" r={R} />
		<circle
			class="fill"
			cx="36"
			cy="36"
			r={R}
			stroke-dasharray={CIRC}
			stroke-dashoffset={offset}
			transform="rotate(-90 36 36)"
		/>
	</svg>
	<span class="label tabular-nums">{value}%</span>
</div>

<style>
	.ring {
		position: relative;
		width: 72px;
		height: 72px;
		margin: 0 auto;
	}
	svg {
		display: block;
	}
	.track {
		fill: none;
		stroke: var(--surface-subtle);
		stroke-width: 6;
	}
	.fill {
		fill: none;
		stroke: var(--brand-500);
		stroke-width: 6;
		stroke-linecap: round;
		transition: stroke-dashoffset var(--transition-moderate);
	}
	.label {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: 700;
		letter-spacing: 0;
		color: var(--text-brand);
	}
	@media (prefers-reduced-motion: reduce) {
		.fill {
			transition: none;
		}
	}
</style>
