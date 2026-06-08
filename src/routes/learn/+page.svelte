<script lang="ts">
	import { useI18n } from '$lib/i18n/context';

	const i18n = useI18n();
	const tx = (zh: string, en: string): string => (i18n().lang === 'zh' ? zh : en);

	// Reached only when there is no content to learn; otherwise the server load
	// redirects to the first incomplete section.
</script>

<div class="empty">
	<p>{tx('暂无课程内容', 'No content yet.')}</p>
</div>

<style>
	.empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--text-tertiary);
	}
</style>
