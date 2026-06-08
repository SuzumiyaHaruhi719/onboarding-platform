import { describe, it, expect } from 'vitest';
import {
	mergeIntervals,
	coveredSeconds,
	coverageRatio,
	sanitizeIntervals,
	coversPrefix
} from './intervals';

describe('mergeIntervals', () => {
	it('合并重叠与相邻区间', () => {
		expect(
			mergeIntervals([
				{ start: 0, end: 5 },
				{ start: 4, end: 8 },
				{ start: 8, end: 10 }
			])
		).toEqual([{ start: 0, end: 10 }]);
	});
	it('保留不相邻区间', () => {
		expect(
			mergeIntervals([
				{ start: 0, end: 2 },
				{ start: 5, end: 7 }
			])
		).toEqual([
			{ start: 0, end: 2 },
			{ start: 5, end: 7 }
		]);
	});
	it('空输入返回空', () => {
		expect(mergeIntervals([])).toEqual([]);
	});
});

describe('coverage', () => {
	it('coveredSeconds 求总覆盖时长', () => {
		expect(
			coveredSeconds([
				{ start: 0, end: 2 },
				{ start: 5, end: 7 }
			])
		).toBe(4);
	});
	it('coverageRatio 比上时长', () => {
		expect(coverageRatio([{ start: 0, end: 9.5 }], 10)).toBeCloseTo(0.95);
	});
	it('时长为 0 返回 0', () => {
		expect(coverageRatio([], 0)).toBe(0);
	});
});

describe('sanitizeIntervals', () => {
	it('剔除 NaN/Infinity/反向区间并钳制到 [0,maxEnd]', () => {
		const dirty = [
			{ start: -2, end: 3 }, // clamp start to 0
			{ start: 5, end: 100 }, // clamp end to 10
			{ start: 8, end: 4 }, // reversed -> dropped
			{ start: Number.NaN, end: 2 }, // dropped (NaN)
			{ start: 1, end: Number.POSITIVE_INFINITY } // dropped (non-finite end)
		] as { start: number; end: number }[];
		expect(sanitizeIntervals(dirty, 10)).toEqual([
			{ start: 0, end: 3 },
			{ start: 5, end: 10 }
		]);
	});
	it('非数组返回空', () => {
		expect(sanitizeIntervals('nope', 10)).toEqual([]);
	});
});

describe('coversPrefix', () => {
	it('从 0 连续覆盖到阈值 → true', () => {
		expect(coversPrefix([{ start: 0, end: 9.6 }], 10, 0.95, 1)).toBe(true);
	});
	it('有缺口(不从 0)→ false', () => {
		expect(
			coversPrefix(
				[
					{ start: 3, end: 6 },
					{ start: 7, end: 10 }
				],
				10,
				0.95,
				1
			)
		).toBe(false);
	});
	it('覆盖不足阈值 → false', () => {
		expect(coversPrefix([{ start: 0, end: 5 }], 10, 0.95, 1)).toBe(false);
	});
});
