import { randomUUID } from 'node:crypto';
import { db, schema } from './index';

type BlockData = { type: string } & Record<string, unknown>;

function addBlock(sectionId: string, order: number, data: BlockData): void {
	db.insert(schema.blocks)
		.values({ id: randomUUID(), sectionId, type: data.type, order, content: JSON.stringify(data) })
		.run();
}

type QuizSeed = {
	type: 'single' | 'multiple' | 'boolean';
	question: string;
	options: string[];
	answer: number | number[] | boolean;
};

/** Create a quiz row + its linked quiz block (1:1), matching the inline model. */
function addQuiz(sectionId: string, blockOrder: number, quizOrder: number, quiz: QuizSeed): void {
	const quizId = randomUUID();
	db.insert(schema.quizzes)
		.values({
			id: quizId,
			sectionId,
			order: quizOrder,
			type: quiz.type,
			question: quiz.question,
			options: JSON.stringify(quiz.options),
			answer: JSON.stringify(quiz.answer)
		})
		.run();
	db.insert(schema.blocks)
		.values({
			id: randomUUID(),
			sectionId,
			type: 'quiz',
			order: blockOrder,
			content: JSON.stringify({ type: 'quiz', quizId })
		})
		.run();
}

function reset(): void {
	db.delete(schema.quizzes).run();
	db.delete(schema.blocks).run();
	db.delete(schema.sections).run();
	db.delete(schema.modules).run();
}

reset();

const moduleId = randomUUID();
db.insert(schema.modules).values({ id: moduleId, title: '公司入职第一课', order: 0 }).run();

// Section 1 — 纯阅读
const s1 = randomUUID();
db.insert(schema.sections)
	.values({ id: s1, moduleId, title: '欢迎与公司价值观', order: 0, minDwellMs: 8000 })
	.run();
addBlock(s1, 0, { type: 'heading', level: 2, text: '欢迎加入' });
addBlock(s1, 1, {
	type: 'paragraph',
	text: '本节介绍公司的使命与价值观。请认真阅读到底部,系统会记录你的阅读进度——只有读完并停留足够时间,才能进入下一节。'
});
addBlock(s1, 2, {
	type: 'callout',
	variant: 'info',
	title: '阅读提示',
	body: '本平台采用强制阅读机制:不能跳过、不能快进,完成每一节才会解锁下一节。'
});
addBlock(s1, 3, { type: 'list', ordered: true, items: ['客户第一', '务实创新', '长期主义'] });
addBlock(s1, 4, {
	type: 'quote',
	text: '我们相信:把简单的事情做到极致,就是不简单。',
	cite: '公司文化手册'
});

// Section 2 — 视频 + 题目
const s2 = randomUUID();
db.insert(schema.sections)
	.values({ id: s2, moduleId, title: '信息安全合规', order: 1, minDwellMs: 5000 })
	.run();
addBlock(s2, 0, { type: 'heading', level: 2, text: '信息安全基础' });
addBlock(s2, 1, { type: 'paragraph', text: '请完整观看下面的视频(不可快进),然后完成测验。' });
addBlock(s2, 2, {
	type: 'video',
	src: 'https://www.w3schools.com/html/mov_bbb.mp4',
	durationSec: 10
});
// Quizzes are authored inline as their own blocks (1:1 quiz row ↔ quiz block).
addQuiz(s2, 3, 0, {
	type: 'single',
	question: '收到来历不明的可疑邮件,正确做法是?',
	options: ['直接点击其中的链接', '转发给同事确认', '上报公司安全团队'],
	answer: 2
});
addQuiz(s2, 4, 1, {
	type: 'boolean',
	question: '为了方便协作,可以与同事共用账号密码。',
	options: ['对', '错'],
	answer: false
});

process.stdout.write('Seeded: 1 module, 2 sections, blocks, 2 quizzes.\n');
