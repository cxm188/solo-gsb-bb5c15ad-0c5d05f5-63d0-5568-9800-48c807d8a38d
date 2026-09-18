import { describe, expect, it } from 'vitest';
import {
  countReview,
  hasReviewBlockers,
  listReviewItems,
  markReviewStatus,
  stricterReview,
} from './review';
import type { RedactionBox, RedactionMap, ReviewStatus } from '../types';

function box(id: string, review: ReviewStatus): RedactionBox {
  return { id, x1: 0, y1: 0, x2: 10, y2: 10, review };
}

const sample: RedactionMap = {
  1: [box('a', 'approved'), box('b', 'pending')],
  3: [box('c', 'needs-adjustment')],
  2: [box('d', 'pending')],
};

describe('stricterReview 严格程度排序', () => {
  it('需调整 > 待复核 > 已通过', () => {
    expect(stricterReview('approved', 'pending')).toBe('pending');
    expect(stricterReview('pending', 'approved')).toBe('pending');
    expect(stricterReview('approved', 'needs-adjustment')).toBe('needs-adjustment');
    expect(stricterReview('pending', 'needs-adjustment')).toBe('needs-adjustment');
    expect(stricterReview('approved', 'approved')).toBe('approved');
  });
});

describe('countReview / hasReviewBlockers', () => {
  it('按状态统计全部遮盖框', () => {
    expect(countReview(sample)).toEqual({
      pending: 2,
      approved: 1,
      needsAdjustment: 1,
      total: 4,
    });
    expect(countReview({})).toEqual({ pending: 0, approved: 0, needsAdjustment: 0, total: 0 });
  });

  it('存在待复核或需调整时拦截导出；全部通过或没有遮盖时放行', () => {
    expect(hasReviewBlockers(sample)).toBe(true);
    expect(hasReviewBlockers({ 1: [box('a', 'approved')] })).toBe(false);
    expect(hasReviewBlockers({})).toBe(false);
    expect(hasReviewBlockers({ 1: [box('a', 'needs-adjustment')] })).toBe(true);
  });
});

describe('listReviewItems 待复核清单', () => {
  it('按原始页号升序列出未通过项，已通过的不在清单中', () => {
    const items = listReviewItems(sample);
    expect(items.map((i) => i.id)).toEqual(['b', 'd', 'c']); // 页 1 → 2 → 3
    expect(items.map((i) => i.page)).toEqual([1, 2, 3]);
    expect(items.every((i) => i.status !== 'approved')).toBe(true);
  });

  it('记录框在页内序号用于展示', () => {
    const items = listReviewItems(sample);
    expect(items.find((i) => i.id === 'b')?.index).toBe(1); // 页 1 的第二个框
    expect(items.find((i) => i.id === 'c')?.index).toBe(0);
  });

  it('全部通过时清单为空', () => {
    expect(listReviewItems({ 1: [box('a', 'approved')] })).toEqual([]);
  });
});

describe('markReviewStatus 批量标记', () => {
  it('逐项标记：只改目标框，返回全新 map', () => {
    const { map, changed } = markReviewStatus(sample, new Set(['b']), 'approved');
    expect(changed).toBe(1);
    expect(map[1][1].review).toBe('approved');
    expect(map[1][0].review).toBe('approved'); // 原本就是
    expect(map[3][0].review).toBe('needs-adjustment'); // 未触及
    // 不就地修改入参
    expect(sample[1][1].review).toBe('pending');
  });

  it('整页标记：一次调用覆盖该页全部框（整批一条撤销记录的基础）', () => {
    const pageIds = (sample[1] ?? []).map((b) => b.id);
    const { map, changed } = markReviewStatus(sample, new Set(pageIds), 'needs-adjustment');
    expect(changed).toBe(2); // approved → needs-adjustment，pending → needs-adjustment
    expect(map[1].every((b) => b.review === 'needs-adjustment')).toBe(true);
    expect(map[2][0].review).toBe('pending'); // 其他页不受影响
  });

  it('状态本就相同的框不计入 changed，全部无变化时调用方可跳过提交', () => {
    const { changed } = markReviewStatus(sample, new Set(['b', 'd']), 'pending');
    expect(changed).toBe(0);
    const one = markReviewStatus(sample, new Set(['a', 'b']), 'approved');
    expect(one.changed).toBe(1); // 只有 b 真正变化
  });

  it('空 id 集合直接返回原 map', () => {
    const { map, changed } = markReviewStatus(sample, new Set(), 'approved');
    expect(changed).toBe(0);
    expect(map).toBe(sample);
  });

  it('不存在的 id 不产生任何变化', () => {
    const { map, changed } = markReviewStatus(sample, new Set(['nope']), 'approved');
    expect(changed).toBe(0);
    expect(map[1][1].review).toBe('pending');
  });
});
