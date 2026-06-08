<script lang="ts">
	import type { Block, QuizData, VideoInterval } from '$lib/content/types';
	import Heading from './blocks/Heading.svelte';
	import Paragraph from './blocks/Paragraph.svelte';
	import ImageBlock from './blocks/ImageBlock.svelte';
	import ListBlock from './blocks/ListBlock.svelte';
	import Quote from './blocks/Quote.svelte';
	import Callout from './blocks/Callout.svelte';
	import VideoBlock from './blocks/VideoBlock.svelte';
	import QuizBlock from './blocks/QuizBlock.svelte';

	let {
		block,
		quizzes,
		sectionId,
		onintervals,
		onpassed
	}: {
		block: Block;
		quizzes: QuizData[];
		sectionId: string;
		onintervals: (intervals: VideoInterval[]) => void;
		onpassed: () => void;
	} = $props();
</script>

{#if block.type === 'heading'}
	<Heading level={block.level} text={block.text} />
{:else if block.type === 'paragraph'}
	<Paragraph text={block.text} />
{:else if block.type === 'image'}
	<ImageBlock src={block.src} alt={block.alt} caption={block.caption} />
{:else if block.type === 'list'}
	<ListBlock ordered={block.ordered} items={block.items} />
{:else if block.type === 'quote'}
	<Quote text={block.text} cite={block.cite} />
{:else if block.type === 'callout'}
	<Callout variant={block.variant} title={block.title} body={block.body} />
{:else if block.type === 'video'}
	<VideoBlock src={block.src} durationSec={block.durationSec} poster={block.poster} {onintervals} />
{:else if block.type === 'quiz'}
	<QuizBlock {quizzes} {sectionId} {onpassed} />
{/if}
