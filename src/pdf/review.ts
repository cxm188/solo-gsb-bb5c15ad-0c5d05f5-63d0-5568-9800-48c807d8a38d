import type { RedactionBox, RedactionMap, ReviewStatus } from '../types';

/**
 * 本地复核工作流（纯函数，不依赖 DOM / pdf.js）：
 *
 * 每个遮盖框都带有复核状态（见 types.ts 的 ReviewStatus）。本模块提供
 * 状态统计、待复核清单与批量标记能力；所有函数均返回全新 RedactionMap
 * （不就地修改入参），调用方一次 set 提交即只产生一条撤销记录。
 *
 * 严格程度（合并方案时重复框保留较严格状态）：
 *   needs-adjustment（需调整） > pending（待复核） > approved（已通过）
 */

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: '待复核',
  approved: '已通过',
  'needs-adjustment': '需调整',
};

const STRICTNESS: Record<ReviewStatus, number> = {
  approved: 0,
  pending: 1,
  'needs-adjustment': 2,
};

/** 两个状态中较严格的一个（需调整 > 待复核 > 已通过） */
export function stricterReview(a: ReviewStatus, b: ReviewStatus): ReviewStatus {
  return STRICTNESS[a] >= STRICTNESS[b] ? a : b;
}

export interface ReviewCounts {
  pending: number;
  approved: number;
  needsAdjustment: number;
  total: number;
}

/** 统计全部遮盖框的复核状态 */
export function countReview(redactions: RedactionMap): ReviewCounts {
  const counts: ReviewCounts = { pending: 0, approved: 0, needsAdjustment: 0, total: 0 };
  for (const key of Object.keys(redactions)) {
    for (const b of redactions[Number(key)] ?? []) {
      counts.total += 1;
      if (b.review === 'approved') counts.approved += 1;
      else if (b.review === 'needs-adjustment') counts.needsAdjustment += 1;
      else counts.pending += 1;
    }
  }
  return counts;
}

/** 是否还有阻止导出的复核项（待复核或需调整） */
export function hasReviewBlockers(redactions: RedactionMap): boolean {
  for (const key of Object.keys(redactions)) {
    for (const b of redactions[Number(key)] ?? []) {
      if (b.review !== 'approved') return true;
    }
  }
  return false;
}

/** 复核面板列表项：一个尚未通过的遮盖框 */
export interface ReviewItem {
  id: string;
  /** 原始页号（从 1 开始） */
  page: number;
  /** 在该页遮盖数组中的序号（从 0 开始，用于「第 N 个」展示） */
  index: number;
  status: ReviewStatus;
  box: RedactionBox;
}

/**
 * 按原始页号升序列出全部未通过的遮盖框（待复核 + 需调整），
 * 同页内保持遮盖数组的原有顺序。
 */
export function listReviewItems(redactions: RedactionMap): ReviewItem[] {
  const items: ReviewItem[] = [];
  const pages = Object.keys(redactions)
    .map(Number)
    .sort((a, b) => a - b);
  for (const page of pages) {
    const boxes = redactions[page] ?? [];
    boxes.forEach((box, index) => {
      if (box.review === 'approved') return;
      items.push({ id: box.id, page, index, status: box.review, box });
    });
  }
  return items;
}

export interface MarkReviewResult {
  map: RedactionMap;
  /** 状态实际发生变化的遮盖框数量（为 0 时调用方不应提交，避免空撤销记录） */
  changed: number;
}

/**
 * 把指定 id 的遮盖框批量标记为同一复核状态。
 * 返回全新 RedactionMap（不就地修改入参）；整批一次提交，只产生一条撤销记录。
 * 状态本就相同的框不计入 changed，也不会被复制替换。
 */
export function markReviewStatus(
  base: RedactionMap,
  ids: ReadonlySet<string>,
  status: ReviewStatus,
): MarkReviewResult {
  if (ids.size === 0) return { map: base, changed: 0 };
  const map: RedactionMap = {};
  let changed = 0;
  for (const key of Object.keys(base)) {
    const n = Number(key);
    map[n] = (base[n] ?? []).map((b) => {
      if (!ids.has(b.id) || b.review === status) return b;
      changed += 1;
      return { ...b, review: status };
    });
  }
  return { map, changed };
}
