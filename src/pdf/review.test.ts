import { describe, expect, it } from 'vitest';
import {
  collectReviewItems,
  countReview,
  markReview,
  reviewBlockers,
  stricterReview,
} from './review';
import type { RedactionBox, RedactionMap, ReviewStatus } from '../types';

const box = (id: string, review: ReviewStatus): RedactionBox => ({
  id,
  x1: 10,
  y1: 10,
  x2: 60,
  y2: 60,
  review,
});

const sample: RedactionMap = {
  1: [box('a', 'pending'), box('b', 'approved')],
  3: [box('c', 'changes-requested')],
};

describe('stricterReview 严格度', () => {
  it('需调整 > 待复核 > 已通过', () => {
    expect(stricterReview('approved', 'pending')).toBe('pending');
    expect(stricterReview('pending', 'approved')).toBe('pending');
    expect(stricterReview('approved', 'changes-requested')).toBe('changes-requested');
    expect(stricterReview('changes-requested', 'pending')).toBe('changes-requested');
    expect(stricterReview('approved', 'approved')).toBe('approved');
  });
});

describe('countReview / reviewBlockers 统计', () => {
  it('按状态统计全部遮盖', () => {
    expect(countReview(sample)).toEqual({
      pending: 1,
      approved: 1,
      changesRequested: 1,
      total: 3,
    });
  });

  it('空文档全部为 0', () => {
    expect(countReview({})).toEqual({ pending: 0, approved: 0, changesRequested: 0, total: 0 });
    expect(reviewBlockers({})).toBe(0);
  });

  it('待复核与需调整都计入导出拦截；全部通过则不拦截', () => {
    expect(reviewBlockers(sample)).toBe(2);
    expect(reviewBlockers({ 1: [box('a', 'approved'), box('b', 'approved')] })).toBe(0);
    expect(reviewBlockers({ 1: [box('a', 'pending')] })).toBe(1);
    expect(reviewBlockers({ 1: [box('a', 'changes-requested')] })).toBe(1);
  });
});

describe('markReview 批量标记', () => {
  it('只改指定 id 的状态，返回全新 map（不就地修改）', () => {
    const snapshot = JSON.stringify(sample);
    const { map, changed } = markReview(sample, new Set(['a', 'c']), 'approved');
    expect(changed).toBe(2);
    expect(map[1][0].review).toBe('approved');
    expect(map[3][0].review).toBe('approved');
    expect(map[1][1].review).toBe('approved'); // 原本已是
    expect(JSON.stringify(sample)).toBe(snapshot); // 入参未被修改
  });

  it('目标状态与现状相同的框不计入 changed', () => {
    const { changed } = markReview(sample, new Set(['b']), 'approved');
    expect(changed).toBe(0);
  });

  it('整页通过：一次调用覆盖该页全部框（对应一条撤销记录）', () => {
    const pageIds = sample[1].map((b) => b.id);
    const { map, changed } = markReview(sample, new Set(pageIds), 'approved');
    expect(changed).toBe(1); // b 已是 approved
    expect(map[1].every((b) => b.review === 'approved')).toBe(true);
    expect(map[3][0].review).toBe('changes-requested'); // 其他页不受影响
  });

  it('整页需调整： pending 与 approved 都可被标记为需调整', () => {
    const pageIds = sample[1].map((b) => b.id);
    const { map, changed } = markReview(sample, new Set(pageIds), 'changes-requested');
    expect(changed).toBe(2);
    expect(map[1].every((b) => b.review === 'changes-requested')).toBe(true);
  });

  it('不存在的 id 被忽略', () => {
    const { map, changed } = markReview(sample, new Set(['nope']), 'approved');
    expect(changed).toBe(0);
    expect(map).toEqual(sample);
  });
});

describe('collectReviewItems 复核面板分组', () => {
  it('只列出待复核与需调整，按原始页号升序', () => {
    const groups = collectReviewItems(sample);
    expect(groups.map((g) => g.page)).toEqual([1, 3]);
    expect(groups[0].boxes.map((b) => b.id)).toEqual(['a']); // b 已通过，不列出
    expect(groups[1].boxes.map((b) => b.id)).toEqual(['c']);
  });

  it('全部通过或没有遮盖时为空', () => {
    expect(collectReviewItems({})).toEqual([]);
    expect(collectReviewItems({ 2: [box('x', 'approved')] })).toEqual([]);
  });
});
