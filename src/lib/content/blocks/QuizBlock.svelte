<script lang="ts">
	import type { QuizData } from '$lib/content/types';
	import { useI18n } from '$lib/i18n/context';
	import Icon from '$lib/components/Icon.svelte';

	let {
		quiz,
		sectionId,
		onpassed
	}: {
		quiz: QuizData;
		sectionId: string;
		onpassed: () => void;
	} = $props();

	const i18n = useI18n();
	const tx = (zh: string, en: string): string => (i18n().lang === 'zh' ? zh : en);

	const TYPE_LABEL: Record<string, () => string> = {
		single: () => tx('单选', 'Single'),
		multiple: () => tx('多选', 'Multiple'),
		boolean: () => tx('判断', 'True/False')
	};

	let single = $state<number | null>(null);
	let multi = $state<number[]>([]);
	let bool = $state<boolean | null>(null);
	let msg = $state('');
	let wrong = $state(false);
	let passed = $state(false);

	function toggleMulti(i: number): void {
		multi = multi.includes(i) ? multi.filter((x) => x !== i) : [...multi, i];
	}

	function currentAnswer(): unknown {
		if (quiz.type === 'single') return single;
		if (quiz.type === 'multiple') return multi;
		return bool;
	}

	async function submit(): Promise<void> {
		wrong = false;
		const res = await fetch('/api/quiz/submit', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ sectionId, quizId: quiz.id, answer: currentAnswer() })
		})
			.then((r) => r.json())
			.catch(() => null);

		if (!res || res.ok === false) {
			wrong = true;
			msg = i18n().t('quiz.wrong');
			return;
		}
		if (res.locked) {
			wrong = true;
			msg = i18n().t('quiz.locked');
			return;
		}
		if (res.passed) {
			passed = true;
			msg = i18n().t('quiz.correct');
			onpassed();
		} else {
			wrong = true;
			msg = i18n().t('quiz.wrong');
		}
	}
</script>

<div class="quiz" class:passed class:wrong>
	<div class="q-head">
		<span class="q-badge">{TYPE_LABEL[quiz.type]?.() ?? quiz.type}</span>
		<p class="q-text">{quiz.question}</p>
		{#if passed}<span class="q-pass"><Icon name="circle-check" size={18} /></span>{/if}
	</div>

	<div class="opts">
		{#if quiz.type === 'single'}
			{#each quiz.options as opt, i (i)}
				<label class:sel={single === i}>
					<input type="radio" name={quiz.id} value={i} disabled={passed} onchange={() => (single = i)} />
					<span>{opt}</span>
				</label>
			{/each}
		{:else if quiz.type === 'boolean'}
			{#each quiz.options as opt, i (i)}
				<label class:sel={bool === (i === 0)}>
					<input type="radio" name={quiz.id} value={i} disabled={passed} onchange={() => (bool = i === 0)} />
					<span>{opt}</span>
				</label>
			{/each}
		{:else}
			{#each quiz.options as opt, i (i)}
				<label class:sel={multi.includes(i)}>
					<input type="checkbox" value={i} checked={multi.includes(i)} disabled={passed} onchange={() => toggleMulti(i)} />
					<span>{opt}</span>
				</label>
			{/each}
		{/if}
	</div>

	<div class="actions">
		{#if passed}
			<span class="msg ok"><Icon name="circle-check" size={15} /> {i18n().t('quiz.correct')}</span>
		{:else}
			<button class="submit" onclick={submit}>{i18n().t('quiz.submit')}</button>
			{#if msg}<span class="msg">{msg}</span>{/if}
		{/if}
	</div>
</div>

<style>
	.quiz {
		margin: var(--space-5) 0;
		padding: var(--space-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-2xl);
		background: var(--surface-elevated);
		box-shadow: var(--shadow-sm);
		transition:
			border-color var(--transition-base),
			background var(--transition-base);
	}
	.quiz.passed {
		/* Passed state stays on a neutral surface; the brand border and check icon
		 * carry success without turning the whole card green. */
		border-color: var(--brand-300);
	}
	.q-head {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	.q-badge {
		flex: none;
		margin-top: 2px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-brand);
		background: var(--brand-50);
		border: 1px solid var(--brand-200);
		border-radius: var(--radius-sm);
		padding: 1px var(--space-2);
	}
	.q-text {
		margin: 0;
		font-weight: 700;
		font-size: var(--text-lg);
		color: var(--text-primary);
		line-height: 1.5;
	}
	.q-pass {
		flex: none;
		margin-left: auto;
		color: var(--brand-500);
	}
	.opts {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	label {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		color: var(--text-secondary);
		cursor: pointer;
		transition: var(--transition-fast);
	}
	label:hover {
		border-color: var(--border-strong);
		background: var(--surface-hover);
	}
	label.sel {
		border-color: var(--brand-400);
		background: var(--brand-50);
		color: var(--text-primary);
	}
	label input {
		accent-color: var(--brand-500);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-4);
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
	.submit:hover {
		background: var(--brand-600);
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}
	.msg {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--warning);
	}
	.msg.ok {
		color: var(--success);
	}
</style>
