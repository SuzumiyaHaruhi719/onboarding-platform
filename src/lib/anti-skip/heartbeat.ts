import type { VideoInterval } from './types';
import { HEARTBEAT_MS } from './constants';

export interface HeartbeatController {
	stop: () => void;
	setIntervals: (intervals: VideoInterval[]) => void;
	markScrolledBottom: () => void;
}

interface HeartbeatOptions {
	sectionId: string;
	intervalMs?: number;
}

/**
 * Client-side reading-signal collector. Accumulates dwell time while the tab is
 * visible, tracks read-to-bottom via the natural page (window) scroll, and
 * forwards watched video intervals. All values are advisory — the server
 * re-validates everything.
 */
export function startHeartbeat(opts: HeartbeatOptions): HeartbeatController {
	let dwellMs = 0;
	let scrolledToBottom = false;
	let intervals: VideoInterval[] = [];
	let last = Date.now();

	function isActive(): boolean {
		try {
			// Accrue reading time whenever the tab is VISIBLE. Don't require OS window
			// focus — a visible-but-unfocused window is still being read. Switching the
			// tab away (visibilityState !== 'visible') still pauses, which is the real gate.
			return document.visibilityState === 'visible';
		} catch {
			return true;
		}
	}

	function checkScroll(): void {
		try {
			const doc = document.documentElement;
			const full = Math.max(doc.scrollHeight, document.body.scrollHeight);
			// Content fits in one viewport (genuinely short) OR scrolled near the bottom.
			if (full <= window.innerHeight + 24) scrolledToBottom = true;
			else if (window.innerHeight + window.scrollY >= full - 48) scrolledToBottom = true;
		} catch {
			// Fail closed: a measurement error must NOT count as "read to bottom".
		}
	}

	const tick = setInterval(() => {
		const now = Date.now();
		if (isActive()) dwellMs += now - last;
		last = now;
		// Re-check each second so short pages / late layout still register as read
		// even when the user never fires a scroll event.
		checkScroll();
	}, 1000);

	window.addEventListener('scroll', checkScroll, { passive: true });
	checkScroll();

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
			window.removeEventListener('scroll', checkScroll);
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
