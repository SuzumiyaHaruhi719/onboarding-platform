import { sqliteTable, text, integer, real, unique } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	name: text('name'),
	role: text('role', { enum: ['learner', 'editor'] })
		.notNull()
		.default('learner'),
	createdAt: integer('created_at').notNull()
});

export const modules = sqliteTable('modules', {
	id: text('id').primaryKey(),
	title: text('title').notNull(),
	order: integer('sort_order').notNull()
});

export const sections = sqliteTable('sections', {
	id: text('id').primaryKey(),
	moduleId: text('module_id')
		.notNull()
		.references(() => modules.id),
	title: text('title').notNull(),
	order: integer('sort_order').notNull(),
	minDwellMs: integer('min_dwell_ms').notNull().default(0)
});

export const blocks = sqliteTable('blocks', {
	id: text('id').primaryKey(),
	sectionId: text('section_id')
		.notNull()
		.references(() => sections.id),
	type: text('type').notNull(),
	order: integer('sort_order').notNull(),
	content: text('content').notNull() // JSON: block data (without id)
});

export const quizzes = sqliteTable('quizzes', {
	id: text('id').primaryKey(),
	sectionId: text('section_id')
		.notNull()
		.references(() => sections.id),
	order: integer('sort_order').notNull(),
	type: text('type', { enum: ['single', 'multiple', 'boolean'] }).notNull(),
	question: text('question').notNull(),
	options: text('options').notNull(), // JSON string[]
	answer: text('answer').notNull() // JSON: number | number[] | boolean
});

export const progress = sqliteTable(
	'progress',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull(),
		sectionId: text('section_id').notNull(),
		status: text('status', { enum: ['locked', 'in_progress', 'completed'] })
			.notNull()
			.default('in_progress'),
		readPct: real('read_pct').notNull().default(0),
		scrolledToBottom: integer('scrolled_to_bottom').notNull().default(0),
		dwellMs: integer('dwell_ms').notNull().default(0),
		videoIntervals: text('video_intervals').notNull().default('[]'), // JSON VideoInterval[]
		quizPassed: integer('quiz_passed').notNull().default(0),
		quizPassedIds: text('quiz_passed_ids').notNull().default('[]'), // JSON string[] of passed quiz ids
		quizAttempts: integer('quiz_attempts').notNull().default(0),
		quizLockedUntil: integer('quiz_locked_until'),
		startedAt: integer('started_at').notNull(),
		lastHeartbeatAt: integer('last_heartbeat_at'),
		completedAt: integer('completed_at')
	},
	(tbl) => [unique().on(tbl.userId, tbl.sectionId)]
);
