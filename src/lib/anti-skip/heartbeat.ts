import type { VideoInterval } from './types';
import { HEARTBEAT_MS } from './constants';

export interface HeartbeatController {
	stop: () => void;
	setIntervals: (intervals: VideoInterval[]) => void;
	markScrolledBottom: () => void;
}

interface HeartbeatOptions {
	sectionId: string;
	scrollEl: HTMLElement;
	intervalMs?: number;
}

/**
 * Client-side reading-signal collector. Accumulates dwell time only while the
 * tab is visible+focused, tracks scroll-to-bottom, and forwards watched video
 * intervals. All values are advisory — the server re-validates everything.
 */
export function startHeartbeat(opts: HeartbeatOptions): HeartbeatController | null {
	if (!opts.scrollEl) return null;

	let dwellMs = 0;
	let scrolledToBottom = false;
	let intervals: VideoInterval[] = [];
	let last = Date.now();

	function isActive(): boolean {
		try {
			return document.visibilityState === 'visible' && document.hasFocus();
		} catch {
			return true;
		}
	}

	const tick = setInterval(() => {
		const now = Date.now();
		if (isActive()) dwellMs += now - last;
		last = now;
	}, 1000);

	function onScroll(): void {
		const el = opts.scrollEl;
		if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) scrolledToBottom = true;
	}
	opts.scrollEl.addEventListener('scroll', onScroll, { passive: true });
	// Content that fits without scrolling counts as read.
	onScroll();

	async function send(): Promise<void> {
		try {
			await fetch('/api/progress/heartbeat', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ sectionId: opts.sectionId, scrolledToBottom, dwellMs, videoIntervals: intervals })
			});
		} catch {
			// transient network errors are non-fatal; next beat retries
		}
	}

	const beat = setInterval(() => void send(), opts.intervalMs ?? HEARTBEAT_MS);

	return {
		stop: () => {
			clearInterval(tick);
			clearInterval(beat);
			opts.scrollEl.removeEventListener('scroll', onScroll);
			void send();
		},
		setIntervals: (next) => {
			intervals = next;
		},
		markScrolledBottom: () => {
			scrolledToBottom = true;
		}
	};
}
