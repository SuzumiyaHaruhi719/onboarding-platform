import { z } from 'zod';

const sectionId = z.string().min(1).max(100);

export const roleSchema = z.object({
	role: z.enum(['learner', 'editor'])
});

export const heartbeatSchema = z.object({
	sectionId,
	scrolledToBottom: z.boolean(),
	dwellMs: z
		.number()
		.finite()
		.min(0)
		.max(1000 * 60 * 60 * 12),
	videoIntervals: z
		.array(z.object({ start: z.number().finite(), end: z.number().finite() }))
		.max(5000)
});

export const completeSchema = z.object({ sectionId });

export const quizSubmitSchema = z.object({
	sectionId,
	answers: z.record(z.string(), z.unknown())
});
