/**
 * 导出页序（纯函数模块）。
 *
 * 编排只影响「导出安全 PDF」时页面的输出顺序与是否输出：
 * - 页面与遮盖始终以**原始页号**（PDF 物理页，从 1 开始）作为稳定标识，
 *   RedactionMap 的键、方案文件的页码均不随编排改变；
 * - PageOrder.ordered 是页号排列（初始为 1..N），PageOrder.excluded 是被排除
 *   （不导出）的原始页号集合；
 * - 重排 / 排除只改这两个派生状态，不进入遮盖的撤销 / 重做历史。
 */

/** 一份导出编排：页号排列 + 被排除（不导出）的原始页号集合 */
export interface PageOrder {
  /** 原始页号按导出顺序排列；包含已排除页，保证恢复后位置不丢 */
  ordered: number[];
  /** 被排除、不参与导出的原始页号 */
  excluded: Set<number>;
}

/** 新导入文档的初始编排：1..N 全部保留、按原始顺序 */
export function defaultOrder(numPages: number): PageOrder {
  const ordered: number[] = [];
  for (let n = 1; n <= numPages; n += 1) ordered.push(n);
  return { ordered, excluded: new Set<number>() };
}

/** 当前编排下实际会导出的原始页号（按导出顺序，不含已排除页） */
export function includedPages(order: PageOrder): number[] {
  return order.ordered.filter((p) => !order.excluded.has(p));
}

/**
 * 把原始页号 page 在编排中移动 delta 位（在完整排列上移动，已排除页也占位）。
 * 已在两端时移动为空操作，返回原对象；否则返回新对象（不就地修改入参）。
 */
export function movePage(order: PageOrder, page: number, delta: number): PageOrder {
  const idx = order.ordered.indexOf(page);
  if (idx < 0) return order;
  const target = idx + Math.sign(delta);
  if (target < 0 || target >= order.ordered.length) return order;
  const ordered = order.ordered.slice();
  const [item] = ordered.splice(idx, 1);
  ordered.splice(target, 0, item);
  return { ...order, ordered };
}

/**
 * 排除（exclude === true）或恢复（false）一个原始页。
 * 至少保留一页：排除最后一个未排除页时返回 null，调用方应拦截并提示。
 */
export function setPageExcluded(
  order: PageOrder,
  page: number,
  exclude: boolean,
): PageOrder | null {
  if (!order.ordered.includes(page)) return order;
  const has = order.excluded.has(page);
  if (exclude === has) return order;
  if (exclude && includedPages(order).length <= 1) return null;
  const excluded = new Set(order.excluded);
  if (exclude) excluded.add(page);
  else excluded.delete(page);
  return { ...order, excluded };
}

/** 是否仍是初始编排（原始顺序且无排除页） */
export function isDefaultOrder(order: PageOrder): boolean {
  if (order.excluded.size > 0) return false;
  return order.ordered.every((p, i) => p === i + 1);
}

/**
 * 沿导出序列翻页：返回当前页在「未排除页序列」中上一 / 下一个原始页号。
 * 方向上没有可翻的页面（含当前页已被排除）时返回 null。
 */
export function navigateIncluded(order: PageOrder, current: number, dir: -1 | 1): number | null {
  const kept = includedPages(order);
  const idx = kept.indexOf(current);
  if (idx < 0) {
    // 当前页已被排除：翻到导出序列中最近的一页
    let nearest: number | null = null;
    let best = Infinity;
    for (const p of kept) {
      const d = order.ordered.indexOf(p) - order.ordered.indexOf(current);
      if (Math.sign(d) === dir && Math.abs(d) < best) {
        best = Math.abs(d);
        nearest = p;
      }
    }
    return nearest;
  }
  const target = idx + dir;
  return target >= 0 && target < kept.length ? kept[target] : null;
}

/** 原始页号在导出序列中的位置（1 开始，仅统计未排除页）；被排除时返回 null */
export function exportPosition(order: PageOrder, page: number): number | null {
  if (order.excluded.has(page)) return null;
  const kept = includedPages(order);
  const idx = kept.indexOf(page);
  return idx >= 0 ? idx + 1 : null;
}
