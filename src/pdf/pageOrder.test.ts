import { describe, expect, it } from 'vitest';
import {
  defaultOrder,
  exportPosition,
  includedPages,
  isDefaultOrder,
  movePage,
  navigateIncluded,
  setPageExcluded,
  type PageOrder,
} from './pageOrder';

describe('defaultOrder', () => {
  it('生成 1..N 的初始编排且无排除页', () => {
    const o = defaultOrder(3);
    expect(o.ordered).toEqual([1, 2, 3]);
    expect(o.excluded.size).toBe(0);
    expect(includedPages(o)).toEqual([1, 2, 3]);
    expect(isDefaultOrder(o)).toBe(true);
  });

  it('0 页文档得到空编排', () => {
    expect(defaultOrder(0).ordered).toEqual([]);
  });
});

describe('movePage', () => {
  it('上移 / 下移交换排列位置，页号仍为原始页号', () => {
    let o = defaultOrder(4);
    o = movePage(o, 3, -1);
    expect(o.ordered).toEqual([1, 3, 2, 4]);
    o = movePage(o, 1, 1);
    expect(o.ordered).toEqual([3, 1, 2, 4]);
  });

  it('任意非零 delta 只移动一位', () => {
    const o = defaultOrder(3);
    expect(movePage(o, 1, 1).ordered).toEqual([2, 1, 3]);
    expect(movePage(o, 3, -5).ordered).toEqual([1, 3, 2]);
  });

  it('到端点后移动为空操作（同一引用）', () => {
    const o = defaultOrder(3);
    expect(movePage(o, 1, -1)).toBe(o);
    expect(movePage(o, 3, 1)).toBe(o);
  });

  it('不就地修改入参', () => {
    const o = defaultOrder(3);
    movePage(o, 2, -1);
    expect(o.ordered).toEqual([1, 2, 3]);
  });

  it('未知页号为空操作', () => {
    const o = defaultOrder(3);
    expect(movePage(o, 9, -1)).toBe(o);
  });
});

describe('setPageExcluded', () => {
  it('排除后不出现在导出页序列，恢复后按原排列位置回来', () => {
    let o = defaultOrder(4);
    o = movePage(o, 4, -1); // [1,2,4,3]
    o = setPageExcluded(o, 2, true)!;
    expect(o.ordered).toEqual([1, 2, 4, 3]); // 排列保留，排除页仍占位
    expect(includedPages(o)).toEqual([1, 4, 3]);
    expect(o.excluded.has(2)).toBe(true);

    o = setPageExcluded(o, 2, false)!;
    expect(includedPages(o)).toEqual([1, 2, 4, 3]);
    expect(isDefaultOrder(o)).toBe(false); // 之前的移动仍保留
  });

  it('重复设置相同状态为空操作（同一引用）', () => {
    const o = defaultOrder(3);
    expect(setPageExcluded(o, 1, false)).toBe(o);
    const ex = setPageExcluded(o, 1, true)!;
    expect(setPageExcluded(ex, 1, true)).toBe(ex);
  });

  it('不允许排除全部页面：只剩一页时排除返回 null', () => {
    let o = defaultOrder(3);
    o = setPageExcluded(o, 1, true)!;
    o = setPageExcluded(o, 2, true)!;
    expect(includedPages(o)).toEqual([3]);
    // 最后一个未排除页不能被排除
    expect(setPageExcluded(o, 3, true)).toBeNull();
    // 原编排未被修改
    expect(includedPages(o)).toEqual([3]);
  });

  it('单页文档无法排除唯一页面', () => {
    expect(setPageExcluded(defaultOrder(1), 1, true)).toBeNull();
  });

  it('未知页号为空操作', () => {
    const o = defaultOrder(2);
    expect(setPageExcluded(o, 9, true)).toBe(o);
  });
});

describe('navigateIncluded', () => {
  it('在未排除页序列中翻页', () => {
    let o: PageOrder = { ordered: [2, 1, 3], excluded: new Set<number>() };
    expect(navigateIncluded(o, 2, 1)).toBe(1); // 沿导出顺序，而非原始页号
    expect(navigateIncluded(o, 1, 1)).toBe(3);
    expect(navigateIncluded(o, 3, 1)).toBeNull();
    expect(navigateIncluded(o, 2, -1)).toBeNull();
  });

  it('跳过已排除页', () => {
    const o: PageOrder = { ordered: [1, 2, 3, 4], excluded: new Set([2, 3]) };
    expect(navigateIncluded(o, 1, 1)).toBe(4);
    expect(navigateIncluded(o, 4, -1)).toBe(1);
  });

  it('当前页被排除时，翻页返回导出序列中该方向最近的页', () => {
    const o: PageOrder = { ordered: [1, 2, 3, 4], excluded: new Set([2]) };
    expect(navigateIncluded(o, 2, 1)).toBe(3);
    expect(navigateIncluded(o, 2, -1)).toBe(1);
  });
});

describe('exportPosition', () => {
  it('给出原始页在导出序列中的位置（1 开始）', () => {
    const o: PageOrder = { ordered: [3, 1, 2], excluded: new Set<number>() };
    expect(exportPosition(o, 3)).toBe(1);
    expect(exportPosition(o, 1)).toBe(2);
    expect(exportPosition(o, 2)).toBe(3);
  });

  it('已排除页返回 null，其余页位置连续', () => {
    let o = defaultOrder(4);
    o = setPageExcluded(o, 2, true)!;
    expect(exportPosition(o, 2)).toBeNull();
    expect(exportPosition(o, 1)).toBe(1);
    expect(exportPosition(o, 3)).toBe(2);
    expect(exportPosition(o, 4)).toBe(3);
  });
});
