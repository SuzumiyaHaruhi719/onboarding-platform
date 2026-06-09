import { z } from 'zod';
import { isProviderId } from '$lib/ai/presets';

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
	quizId: z.string().min(1).max(100),
	answer: z.union([z.number().int(), z.boolean(), z.array(z.number().int()).max(20)])
});

// ---- Editor input ----

export const blockInputSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3)]), text: z.string().min(1).max(300) }),
	z.object({ type: z.literal('paragraph'), text: z.string().min(1).max(8000) }),
	z.object({ type: z.literal('image'), src: z.string().min(1).max(2000), alt: z.string().max(300), caption: z.string().max(300).optional() }),
	z.object({ type: z.literal('list'), ordered: z.boolean(), items: z.array(z.string().min(1).max(500)).min(1).max(50) }),
	z.object({ type: z.literal('quote'), text: z.string().min(1).max(2000), cite: z.string().max(200).optional() }),
	z.object({
		type: z.literal('callout'),
		variant: z.enum(['info', 'success', 'warning', 'error']),
		title: z.string().min(1).max(200),
		body: z.string().max(2000)
	}),
	z.object({ type: z.literal('video'), src: z.string().min(1).max(2000), durationSec: z.number().positive().max(86400), poster: z.string().max(2000).optional() }),
	z.object({ type: z.literal('richtext'), markdown: z.string().min(1).max(50000) })
	// NOTE: 'quiz' is intentionally absent — quiz blocks own a quiz row 1:1 and are
	// only ever created/updated/deleted via insertQuizBlock()/updateQuiz()/deleteBlock(),
	// never the generic block insert/update endpoints.
]);
// Note: the BlockInput/QuizInput TS types live in $lib/content/types (client-safe,
// single source of truth). These Zod schemas validate to those same shapes.

const quizBase = z.object({
	question: z.string().min(1).max(1000),
	options: z.array(z.string().min(1).max(500)).min(2).max(10)
});
export const quizInputSchema = z
	.discriminatedUnion('type', [
		quizBase.extend({ type: z.literal('single'), answer: z.number().int().min(0) }),
		quizBase.extend({ type: z.literal('boolean'), answer: z.boolean() }),
		quizBase.extend({ type: z.literal('multiple'), answer: z.array(z.number().int().min(0)).min(1).max(10) })
	])
	.superRefine((val, ctx) => {
		if (val.type === 'single' && val.answer >= val.options.length) {
			ctx.addIssue({ code: 'custom', message: 'answer index out of range' });
		}
		if (val.type === 'multiple') {
			if (new Set(val.answer).size !== val.answer.length) {
				ctx.addIssue({ code: 'custom', message: 'duplicate answer indices' });
			}
			if (val.answer.some((a) => a >= val.options.length)) {
				ctx.addIssue({ code: 'custom', message: 'answer index out of range' });
			}
		}
	});
export const createModuleSchema = z.object({ title: z.string().min(1).max(200) });
export const createSectionSchema = z.object({ moduleId: sectionId, title: z.string().min(1).max(200) });
export const updateSectionSchema = z.object({
	title: z.string().min(1).max(200).optional(),
	minDwellMs: z.number().int().min(0).max(3600000).optional()
});
export const reorderSchema = z.object({ orderedIds: z.array(sectionId).max(200) });

const positionSchema = z.union([
	z.literal('start'),
	z.literal('end'),
	z.object({ afterId: z.string().min(1).max(100) })
]);

export const insertBlocksSchema = z.object({
	sectionId,
	blocks: z.array(blockInputSchema).min(1).max(80),
	position: positionSchema
});

/** Author a quiz inline → creates the quiz row + its quiz block in one call. */
export const insertQuizBlockSchema = z.object({
	sectionId,
	quiz: quizInputSchema,
	position: positionSchema
});

// ---- AI provider settings ----

const httpUrl = z
	.string()
	.min(1)
	.max(2000)
	.refine((u) => /^https?:\/\//i.test(u), { message: 'baseUrl 必须是 http(s) 地址 / must be an http(s) URL' });

const providerId = z.string().refine(isProviderId, { message: 'unknown provider' });
const aiTimeoutMs = z.number().int().min(1000).max(600_000).optional();
const apiKey = z.string().max(500).optional();

/** Create/update payload. On update, an empty/omitted apiKey keeps the stored key. */
export const aiProfileInputSchema = z.object({
	name: z.string().min(1).max(100),
	provider: providerId,
	baseUrl: httpUrl,
	model: z.string().min(1).max(200),
	apiKey,
	timeoutMs: aiTimeoutMs
});

/** Connection-test payload: an inline config, optionally tied to an existing profile id
 *  so a blank key reuses the stored secret. */
export const aiTestSchema = z.object({
	id: z.string().min(1).max(100).optional(),
	baseUrl: httpUrl,
	model: z.string().min(1).max(200),
	apiKey,
	timeoutMs: aiTimeoutMs
});
