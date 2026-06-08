<script lang="ts">
	import type { QuizData } from '$lib/content/types';
	import { useI18n } from '$lib/i18n/context';

	let {
		quizzes,
		sectionId,
		onpassed
	}: { quizzes: QuizData[]; sectionId: string; onpassed: () => void } = $props();

	const i18n = useI18n();

	let single = $state<Record<string, number>>({});
	let multi = $state<Record<string, number[]>>({});
	let bool = $state<Record<string, boolean>>({});
	let msg = $state('');
	let passed = $state(false);

	function toggleMulti(qid: string, i: number): void {
		const arr = multi[qid] ?? [];
		multi[qid] = arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i];
	}

	function buildAnswers(): Record<string, unknown> {
		const out: Record<string, unknown> = {};
		for (const q of quizzes) {
			if (q.type === 'single') out[q.id] = single[q.id];
			else if (q.type === 'multiple') out[q.id] = multi[q.id] ?? [];
			else out[q.id] = bool[q.id];
		}
		return out;
	}

	async function submit(): Promise<void> {
		const res = await fetch('/api/quiz/submit', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ sectionId, answers: buildAnswers() })
		})
			.then((r) => r.json())
			.catch(() => null);

		if (!res) {
			msg = i18n().t('quiz.wrong');
			return;
		}
		if (res.locked) {
			msg = i18n().t('quiz.locked');
			return;
		}
		if (res.passed) {
			passed = true;
			msg = i18n().t('quiz.correct');
			onpassed();
		} else {
			msg = i18n().t('quiz.wrong');
		}
	}
</script>

<div class="quiz">
	{#each quizzes as q (q.id)}
		<fieldset>
			<legend>{q.question}</legend>
			{#if q.type === 'single'}
				{#each q.options as opt, i (i)}
					<label>
						<input type="radio" name={q.id} value={i} onchange={() => (single[q.id] = i)} />
						<span>{opt}</span>
					</label>
				{/each}
			{:else if q.type === 'boolean'}
				{#each q.options as opt, i (i)}
					<label>
						<input type="radio" name={q.id} value={i} onchange={() => (bool[q.id] = i === 0)} />
						<span>{opt}</span>
					</label>
				{/each}
			{:else}
				{#each q.options as opt, i (i)}
					<label>
						<input type="checkbox" value={i} onchange={() => toggleMulti(q.id, i)} />
						<span>{opt}</span>
					</label>
				{/each}
			{/if}
		</fieldset>
	{/each}

	<div class="actions">
		<button class="submit" onclick={submit} disabled={passed}>{i18n().t('quiz.submit')}</button>
		{#if msg}<span class="msg" class:ok={passed}>{msg}</span>{/if}
	</div>
</div>

<style>
	.quiz {
		margin: var(--space-4) 0;
		padding: var(--space-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-2xl);
		background: var(--surface-elevated);
		box-shadow: var(--shadow-sm);
	}
	fieldset {
		border: none;
		padding: 0;
		margin: 0 0 var(--space-4);
	}
	legend {
		font-weight: 700;
		color: var(--text-primary);
		margin-bottom: var(--space-2);
		padding: 0;
	}
	label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-secondary);
		padding: var(--space-1) 0;
		cursor: pointer;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.submit {
		padding: var(--space-2) var(--space-5);
		border: none;
		border-radius: var(--radius-lg);
		background: var(--brand-500);
		color: var(--text-inverse);
		font-weight: 700;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: var(--transition-base);
	}
	.submit:hover:not(:disabled) {
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}
	.submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.msg {
		font-size: var(--text-sm);
		color: var(--warning);
	}
	.msg.ok {
		color: var(--success);
	}
</style>
