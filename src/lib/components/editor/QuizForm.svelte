<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { QuizInput, EditorQuiz } from '$lib/content/types';
	import { useI18n } from '$lib/i18n/context';

	let {
		initial,
		onsave,
		oncancel
	}: { initial?: EditorQuiz; onsave: (quiz: QuizInput) => void; oncancel: () => void } = $props();

	// Snapshot the prop once (forms are created fresh per edit); avoids reactive
	// re-init and the state_referenced_locally warning.
	const init = untrack(() => initial);
	let type = $state<QuizInput['type']>(init?.type ?? 'single');
	let question = $state(init?.question ?? '');
	let options = $state<string[]>(init && init.type !== 'boolean' ? [...init.options] : ['', '']);
	let answerSingle = $state<number>(init?.type === 'single' ? (init.answer as number) : 0);
	let answerMulti = $state<number[]>(init?.type === 'multiple' ? [...(init.answer as number[])] : []);
	let answerBool = $state<boolean>(init?.type === 'boolean' ? (init.answer as boolean) : true);
	let err = $state('');
	const i18n = useI18n();
	const tx = (zh: string, en: string): string => (i18n().lang === 'zh' ? zh : en);

	function addOption(): void {
		options = [...options, ''];
	}
	function removeOption(i: number): void {
		options = options.filter((_, idx) => idx !== i);
		answerMulti = answerMulti.filter((a) => a !== i).map((a) => (a > i ? a - 1 : a));
		if (answerSingle === i) answerSingle = 0;
		else if (answerSingle > i) answerSingle -= 1;
	}
	function toggleMulti(i: number): void {
		answerMulti = answerMulti.includes(i)
			? answerMulti.filter((a) => a !== i)
			: [...answerMulti, i];
	}

	function build(): QuizInput | null {
		const q = question.trim();
		if (!q) return null;
		if (type === 'boolean') {
			return { type, question: q, options: [tx('对', 'True'), tx('错', 'False')], answer: answerBool };
		}
		const opts = options.map((o) => o.trim());
		if (opts.length < 2 || opts.some((o) => !o)) return null;
		if (type === 'single') {
			if (answerSingle < 0 || answerSingle >= opts.length) return null;
			return { type, question: q, options: opts, answer: answerSingle };
		}
		// multiple
		const ans = [...new Set(answerMulti)].filter((a) => a >= 0 && a < opts.length).sort((a, b) => a - b);
		if (ans.length === 0) return null;
		return { type, question: q, options: opts, answer: ans };
	}

	function save(): void {
		const quiz = build();
		if (!quiz) {
			err = tx('请填写题干、至少两个选项，并标记正确答案', 'Add a question, at least two options, and mark the correct answer');
			return;
		}
		onsave(quiz);
	}
</script>

<div class="form">
	<label class="row">
		<span>{tx('题型', 'Type')}</span>
		<select bind:value={type}>
			<option value="single">{tx('单选', 'Single choice')}</option>
			<option value="multiple">{tx('多选', 'Multiple choice')}</option>
			<option value="boolean">{tx('判断', 'True/False')}</option>
		</select>
	</label>

	<textarea class="inp" rows="2" placeholder={tx('题干', 'Question')} bind:value={question}></textarea>

	{#if type === 'boolean'}
		<div class="bool">
			<label><input type="radio" name="bool" checked={answerBool} onchange={() => (answerBool = true)} /> {tx('对（正确答案）', 'True (correct)')}</label>
			<label><input type="radio" name="bool" checked={!answerBool} onchange={() => (answerBool = false)} /> {tx('错（正确答案）', 'False (correct)')}</label>
		</div>
	{:else}
		<div class="opts">
			{#each options as opt, i (i)}
				<div class="opt">
					{#if type === 'single'}
						<input type="radio" name="ans" checked={answerSingle === i} onchange={() => (answerSingle = i)} title={tx('标为正确答案', 'Mark as correct')} />
					{:else}
						<input type="checkbox" checked={answerMulti.includes(i)} onchange={() => toggleMulti(i)} title={tx('标为正确答案', 'Mark as correct')} />
					{/if}
					<input
						class="inp"
						placeholder={tx(`选项 ${i + 1}`, `Option ${i + 1}`)}
						value={options[i] ?? ''}
						oninput={(e) => (options[i] = e.currentTarget.value)}
					/>
					<button class="x" onclick={() => removeOption(i)} disabled={options.length <= 2} aria-label={tx('删除选项', 'Delete option')}><Icon name="x" size={15} /></button>
				</div>
			{/each}
			<button class="btn-ghost" onclick={addOption}><Icon name="plus" size={14} /> {tx('添加选项', 'Add option')}</button>
		</div>
		<p class="hint">{tx('勾选/圆点标记正确答案', 'Use the check/radio control to mark correct answers')}({type === 'single' ? tx('单选一个', 'choose one') : tx('多选可多个', 'choose multiple')})</p>
	{/if}

	{#if err}<p class="err">{err}</p>{/if}
	<div class="actions">
		<button class="btn-primary" onclick={save}>{tx('保存题目', 'Save quiz')}</button>
		<button class="btn-ghost" onclick={oncancel}>{tx('取消', 'Cancel')}</button>
	</div>
</div>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-page);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.row span {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}
	.inp,
	select,
	textarea {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-elevated);
		color: var(--text-primary);
		font-size: var(--text-sm);
		font-family: inherit;
	}
	textarea,
	.opt .inp {
		width: 100%;
	}
	textarea {
		resize: vertical;
	}
	.inp:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: var(--brand-500);
		box-shadow: 0 0 0 3px var(--brand-200);
	}
	.opts {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.opt {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.bool {
		display: flex;
		gap: var(--space-5);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}
	.bool label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
	}
	.x {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--text-tertiary);
		cursor: pointer;
		padding: var(--space-1);
	}
	.x:hover:not(:disabled) {
		color: var(--error);
	}
	.x:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.hint {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		margin: 0;
	}
	.err {
		color: var(--error);
		font-size: var(--text-sm);
		margin: 0;
	}
	.actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.btn-primary {
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-lg);
		background: var(--brand-500);
		color: var(--text-inverse);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.btn-ghost {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-4);
		border: none;
		background: transparent;
		color: var(--text-brand);
		cursor: pointer;
		font-size: var(--text-sm);
	}
</style>
