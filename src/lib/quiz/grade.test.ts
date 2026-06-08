import { describe, it, expect } from 'vitest';
import { gradeQuiz } from './grade';

describe('gradeQuiz', () => {
	it('单选正确', () => expect(gradeQuiz('single', 2, 2, 3)).toBe(true));
	it('单选错误', () => expect(gradeQuiz('single', 2, 1, 3)).toBe(false));
	it('单选越界 → false', () => expect(gradeQuiz('single', 2, 5, 3)).toBe(false));
	it('单选非整数 → false', () => expect(gradeQuiz('single', 2, 1.5, 3)).toBe(false));

	it('判断正确', () => expect(gradeQuiz('boolean', true, true)).toBe(true));
	it('判断错误', () => expect(gradeQuiz('boolean', false, true)).toBe(false));
	it('判断非布尔 → false', () => expect(gradeQuiz('boolean', true, 'true')).toBe(false));

	it('多选顺序无关', () => expect(gradeQuiz('multiple', [0, 2], [2, 0], 3)).toBe(true));
	it('多选缺项 → false', () => expect(gradeQuiz('multiple', [0, 2], [0], 3)).toBe(false));
	it('多选多项 → false', () => expect(gradeQuiz('multiple', [0], [0, 1], 3)).toBe(false));
	it('多选重复项 → false', () => expect(gradeQuiz('multiple', [0, 1], [1, 1], 3)).toBe(false));
	it('多选越界 → false', () => expect(gradeQuiz('multiple', [0, 1], [0, 9], 3)).toBe(false));
	it('多选非数组 → false', () => expect(gradeQuiz('multiple', [0], '0', 3)).toBe(false));
});
