<script lang="ts">
	import { onMount } from 'svelte';

	// Scroll-linked reading position for the current section (0→1). Purely a
	// visual cue for the learner — the server still owns the real read-to-bottom
	// signal via the heartbeat. Short pages (nothing to scroll) read as full.
	let pct = $state(0);

	function update(): void {
		const doc = document.documentElement;
		const max = doc.scrollHeight - window.innerHeight;
		pct = max <= 0 ? 1 : Math.min(1, Math.max(0, window.scrollY / max));
	}

	onMount(() => {
		update();
		let raf = 0;
		const onScroll = (): void => {
			if (raf) return;
			raf = requestAnimationFrame(() => {
				raf = 0;
				update();
			});
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
		return () => {
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
			if (raf) cancelAnimationFrame(raf);
		};
	});
</script>

<div
	class="reading-progress"
	role="progressbar"
	aria-label="阅读进度 / Reading progress"
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={Math.round(pct * 100)}
>
	<div class="fill" style="transform: scaleX({pct})"></div>
</div>

<style>
	.reading-progress {
		position: fixed;
		top: 56px; /* sits directly under the global nav */
		left: 0;
		right: 0;
		height: 3px;
		z-index: 40;
		pointer-events: none;
		background: transparent;
	}
	.fill {
		height: 100%;
		width: 100%;
		transform-origin: left center;
		/* Functional brand accent (like a chart line / focus ring) — flat, no glow
		 * per GLP-dark (no colored box-shadow). */
		background: linear-gradient(90deg, var(--brand-500), var(--accent-emerald));
		will-change: transform;
	}
	@media (prefers-reduced-motion: no-preference) {
		.fill {
			transition: transform 90ms linear;
		}
	}
</style>
