<script lang="ts">
	import type { VideoInterval } from '$lib/anti-skip/types';
	import { VIDEO_MAX_STEP_SEC } from '$lib/anti-skip/constants';

	let {
		src,
		durationSec,
		poster,
		onintervals
	}: {
		src: string;
		durationSec: number;
		poster?: string;
		onintervals: (intervals: VideoInterval[]) => void;
	} = $props();

	let video = $state<HTMLVideoElement | undefined>(undefined);
	let maxAllowed = 0; // furthest second legitimately reached
	let lastT = 0;
	let intervals: VideoInterval[] = [];

	function onTimeUpdate(): void {
		const v = video;
		if (!v) return;
		const t = v.currentTime;
		// Block forward skips: snap back to the furthest legitimately watched point.
		if (t > maxAllowed + 0.5) {
			v.currentTime = maxAllowed;
			return;
		}
		const step = t - lastT;
		if (step > 0 && step <= VIDEO_MAX_STEP_SEC) {
			intervals = [...intervals, { start: lastT, end: t }];
			onintervals(intervals);
		}
		lastT = t;
		if (t > maxAllowed) maxAllowed = t;
	}

	function onSeeking(): void {
		const v = video;
		if (v && v.currentTime > maxAllowed + 0.5) v.currentTime = maxAllowed;
	}

	function onRateChange(): void {
		const v = video;
		if (v && v.playbackRate !== 1) v.playbackRate = 1;
	}

	$effect(() => {
		function pause(): void {
			if (video && document.visibilityState !== 'visible') video.pause();
		}
		function blurPause(): void {
			video?.pause();
		}
		document.addEventListener('visibilitychange', pause);
		window.addEventListener('blur', blurPause);
		return () => {
			document.removeEventListener('visibilitychange', pause);
			window.removeEventListener('blur', blurPause);
		};
	});
</script>

<video
	bind:this={video}
	{src}
	{poster}
	controls
	controlslist="nodownload noplaybackrate noremoteplayback"
	disablepictureinpicture
	preload="metadata"
	title={`时长约 ${durationSec} 秒 / ~${durationSec}s`}
	ontimeupdate={onTimeUpdate}
	onseeking={onSeeking}
	onratechange={onRateChange}
>
	<track kind="captions" />
</video>

<style>
	video {
		width: 100%;
		border-radius: var(--radius-xl);
		border: 1px solid var(--border-default);
		background: #000;
		margin: 0 0 var(--space-4);
	}
</style>
