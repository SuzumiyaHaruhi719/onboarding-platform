export type Lang = 'zh' | 'en';

export const dict = {
	'app.title': { zh: '新员工入职', en: 'Onboarding' },
	'role.pick': { zh: '请选择你的身份', en: 'Choose your role' },
	'role.pick.sub': {
		zh: '不同身份进入不同的工作区',
		en: 'Each role opens a different workspace'
	},
	'role.learner': { zh: '我是新员工', en: "I'm a new hire" },
	'role.learner.desc': { zh: '按章节完成入职阅读与测验', en: 'Complete onboarding section by section' },
	'role.editor': { zh: '我是编辑者', en: "I'm an editor" },
	'role.editor.desc': { zh: '管理课程内容(后续开放)', en: 'Manage course content (coming soon)' },
	'learn.continue': { zh: '继续', en: 'Continue' },
	'learn.locked': { zh: '完成本节后解锁', en: 'Complete this section to unlock' },
	'learn.progress': { zh: '本节进度', en: 'Section progress' },
	'learn.done': { zh: '已完成', en: 'Completed' },
	'learn.editorComingSoon': {
		zh: '编辑者工作区将在 P2 开放,现在先以学员身份预览。',
		en: 'The editor workspace ships in P2. Previewing as a learner for now.'
	},
	'req.scroll': { zh: '读完本节正文', en: 'Read to the end' },
	'req.dwell': { zh: '阅读时间不足', en: 'Keep reading a bit longer' },
	'req.video': { zh: '完整看完视频', en: 'Finish the video' },
	'req.quiz': { zh: '答对所有题目', en: 'Answer all questions correctly' },
	'quiz.submit': { zh: '提交答案', en: 'Submit' },
	'quiz.wrong': { zh: '有答案不正确,请重试', en: 'Some answers are wrong, try again' },
	'quiz.correct': { zh: '全部正确', en: 'All correct' },
	'quiz.locked': { zh: '尝试次数过多,请稍后再试', en: 'Too many attempts, try again shortly' }
} as const;

export type DictKey = keyof typeof dict;
