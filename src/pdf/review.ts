import type { RedactionBox, RedactionMap, ReviewStatus } from '../types';

/**
 * 本地复核工作流（纯函数）：
 *
 * 每个遮盖框携带复核状态（见 types.ts）。新建、批量生成或几何被修改的遮盖
 * 一律为「待复核」；复核面板可逐项或整页标记「已通过」/「需调整」；
 * 「需调整」项几何被修改后自动回到「待复核」。仍存在待复核 / 需调整项时
 * 导出安全 PDF 必须被拦截（不可绕过），全部通过后才可导出。
 *
 * 本模块只提供统计、严格度比较与批量标记等纯计算：批量标记返回全新的
 * RedactionMap，调用方一次 set 提交，因此整批复核操作只产生一条撤销记录。
 */

/**
 * 严格度：需调整 > 待复核 > 已通过。
 * 合并方案时坐标重复的框保留较严格状态（只可能变严，不会放宽）。
 */
const STRICTNESS: Record<ReviewStatus, number> = {
  approved: 0,
  pending: 1,
  'changes-requested': 2,
};

export const stricterReview = (a: ReviewStatus, b: ReviewStatus): ReviewStatus =>
  STRICTNESS[a] >= STRICTNESS[b] ? a : b;

export interface ReviewCounts {
  pending: number;
  approved: number;
  changesRequested: number;
  total: number;
}

/** 统计全部遮盖的复核状态 */
export function countReview(redactions: RedactionMap): ReviewCounts {
  const counts: ReviewCounts = { pending: 0, approved: 0, changesRequested: 0, total: 0 };
  for (const key of Object.keys(redactions)) {
    for (const b of redactions[Number(key)] ?? []) {
      counts.total += 1;
      if (b.review === 'approved') counts.approved += 1;
      else if (b.review === 'changes-requested') counts.changesRequested += 1;
      else counts.pending += 1;
    }
  }
  return counts;
}

/** 仍阻止导出的遮盖数量（待复核 + 需调整） */
export function reviewBlockers(redactions: RedactionMap): number {
  const c = countReview(redactions);
  return c.pending + c.changesRequested;
}

/**
 * 把指定 id 的遮盖统一标记为某个复核状态，返回全新 RedactionMap（不就地修改入参）。
 * 一次调用对应调用方一次 set 提交，因此无论标记单项、整页还是多页，
 * 整批操作都只产生一条撤销记录。
 */
export function markReview(
  redactions: RedactionMap,
  ids: ReadonlySet<string>,
  status: ReviewStatus,
): { map: RedactionMap; changed: number } {
  let changed = 0;
  const map: RedactionMap = {};
  for (const key of Object.keys(redactions)) {
    const n = Number(key);
    map[n] = (redactions[n] ?? []).map((b) => {
      if (!ids.has(b.id) || b.review === status) return b;
      changed += 1;
      return { ...b, review: status };
    });
  }
  return { map, changed };
}

/**
 * 复核面板条目：仍需处理的遮盖（待复核 / 需调整），按原始页号升序分组。
 * 已通过的遮盖不列出（复核面板是一个待办队列）。
 */
export function collectReviewItems(
  redactions: RedactionMap,
): Array<{ page: number; boxes: RedactionBox[] }> {
  const pages = Object.keys(redactions)
    .map(Number)
    .sort((a, b) => a - b);
  const out: Array<{ page: number; boxes: RedactionBox[] }> = [];
  for (const p of pages) {
    const boxes = (redactions[p] ?? []).filter((b) => b.review !== 'approved');
    if (boxes.length > 0) out.push({ page: p, boxes });
  }
  return out;
}
