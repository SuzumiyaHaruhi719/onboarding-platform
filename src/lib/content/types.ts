import type { VideoInterval } from '$lib/anti-skip/types';

export type { VideoInterval };

export type QuizType = 'single' | 'multiple' | 'boolean';

/** A quiz as shown to the learner — never includes the correct answer. */
export interface QuizData {
	id: string;
	order: number;
	type: QuizType;
	question: string;
	options: string[];
}

export type Block =
	| { id: string; type: 'heading'; level: 2 | 3; text: string }
	| { id: string; type: 'paragraph'; text: string }
	| { id: string; type: 'image'; src: string; alt: string; caption?: string }
	| { id: string; type: 'list'; ordered: boolean; items: string[] }
	| { id: string; type: 'quote'; text: string; cite?: string }
	| {
			id: string;
			type: 'callout';
			variant: 'info' | 'success' | 'warning' | 'error';
			title: string;
			body: string;
	  }
	| { id: string; type: 'video'; src: string; durationSec: number; poster?: string }
	| { id: string; type: 'quiz' };

export type BlockType = Block['type'];

export interface SectionRequirementsView {
	minDwellMs: number;
	hasVideo: boolean;
	videoDurationSec: number | null;
	hasQuiz: boolean;
	videoCoverageThreshold: number;
}

export interface SectionView {
	id: string;
	title: string;
	blocks: Block[];
	quizzes: QuizData[];
	requirements: SectionRequirementsView;
}
