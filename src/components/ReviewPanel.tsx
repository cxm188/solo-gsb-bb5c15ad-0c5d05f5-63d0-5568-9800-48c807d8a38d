import { useMemo } from 'react';
import type { ReviewStatus } from '../types';
import { REVIEW_STATUS_LABEL, type ReviewCounts, type ReviewItem } from '../pdf/review';

interface Props {
  /** 全部未通过的遮盖框（待复核 + 需调整），已按原始页号升序排列 */
  items: ReviewItem[];
  counts: ReviewCounts;
  currentPage: number;
  /** 画布当前选中的遮盖 id（列表中高亮对应行） */
  selectedId: string | null;
  /** 点击条目：跳页并在画布上选中该遮盖框 */
  onLocate(item: ReviewItem): void;
  onJump(page: number): void;
  /** 逐项标记（整批一次提交，只产生一条撤销记录） */
  onMarkItems(ids: string[], status: ReviewStatus): void;
  /** 整页标记（该页全部遮盖框，一次提交只产生一条撤销记录） */
  onMarkPage(page: number, status: ReviewStatus): void;
  onClose(): void;
}

/**
 * 本地复核面板：按原始页号列出全部「待复核 / 需调整」的遮盖框。
 * 新建、批量生成或几何被修改的遮盖都会回到「待复核」；逐项或整页标记
 * 「已通过 / 需调整」；全部遮盖「已通过」后才允许导出安全 PDF（硬性拦截，不可绕过）。
 */
export function ReviewPanel(props: Props) {
  const { counts } = props;
  const blocked = counts.pending + counts.needsAdjustment;

  const groups = useMemo(() => {
    const byPage = new Map<number, ReviewItem[]>();
    for (const item of props.items) {
      const list = byPage.get(item.page) ?? [];
      list.push(item);
      byPage.set(item.page, list);
    }
    return [...byPage.entries()].sort((a, b) => a[0] - b[0]);
  }, [props.items]);

  return (
    <aside className="find-panel review-panel">
      <div className="find-head">
        <span className="find-title">复核</span>
        <button className="find-close" onClick={props.onClose} title="关闭面板" aria-label="关闭">
          ×
        </button>
      </div>

      <div className="find-hint">
        每个新建或修改过的遮盖框都需人工复核；全部「已通过」后才能导出安全 PDF
        （存在待复核 / 需调整项时导出会被拦截，不可跳过）。
      </div>

      <div className="review-summary">
        <span className="review-stat review-stat-pending">待复核 {counts.pending}</span>
        <span className="review-stat review-stat-adjust">需调整 {counts.needsAdjustment}</span>
        <span className="review-stat review-stat-approved">已通过 {counts.approved}</span>
      </div>

      {counts.total === 0 && (
        <div className="find-status dim">当前文档还没有遮盖框，无需复核。</div>
      )}
      {counts.total > 0 && blocked === 0 && (
        <div className="find-status ok">全部 {counts.total} 处遮盖均已通过复核，可以导出安全 PDF。</div>
      )}
      {blocked > 0 && (
        <div className="find-status warn">
          还有 {blocked} 处遮盖未通过复核，导出安全 PDF 将被拦截。
        </div>
      )}

      <div className="find-results">
        {groups.map(([page, items]) => (
          <div key={page} className={`find-group${page === props.currentPage ? ' current' : ''}`}>
            <div className="find-group-head">
              <button type="button" className="find-page-link" onClick={() => props.onJump(page)}>
                第 {page} 页
              </button>
              <span className="dim">{items.length} 项</span>
            </div>
            <div className="review-page-actions">
              <button
                type="button"
                onClick={() => props.onMarkPage(page, 'approved')}
                title="把本页全部遮盖框标记为已通过（一条撤销记录）"
              >
                整页通过
              </button>
              <button
                type="button"
                onClick={() => props.onMarkPage(page, 'needs-adjustment')}
                title="把本页全部遮盖框标记为需调整（一条撤销记录）"
              >
                整页需调整
              </button>
            </div>
            <ul className="find-hit-list">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`review-item${props.selectedId === item.id ? ' selected' : ''}`}
                >
                  <span
                    className={`review-dot review-${item.status}`}
                    title={REVIEW_STATUS_LABEL[item.status]}
                  />
                  <code
                    className="find-snippet"
                    title="点击跳转到该页并选中此遮盖框"
                    onClick={() => props.onLocate(item)}
                  >
                    第 {item.index + 1} 个遮盖
                    <span className="review-where">
                      {REVIEW_STATUS_LABEL[item.status]} · {formatRect(item.box)}
                    </span>
                  </code>
                  <span className="review-item-actions">
                    <button
                      type="button"
                      className="review-approve"
                      onClick={() => props.onMarkItems([item.id], 'approved')}
                      title="确认该遮盖位置无误"
                    >
                      通过
                    </button>
                    <button
                      type="button"
                      className="review-reject"
                      disabled={item.status === 'needs-adjustment'}
                      onClick={() => props.onMarkItems([item.id], 'needs-adjustment')}
                      title="标记为需调整；修改几何后会自动回到待复核"
                    >
                      需调整
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}

/** 坐标摘要：取整后的「x, y 宽×高」，帮助在页面上辨认遮盖框 */
function formatRect(box: { x1: number; y1: number; x2: number; y2: number }): string {
  const r = (n: number) => Math.round(n);
  return `(${r(box.x1)}, ${r(box.y1)}) ${r(box.x2 - box.x1)}×${r(box.y2 - box.y1)} 点`;
}
