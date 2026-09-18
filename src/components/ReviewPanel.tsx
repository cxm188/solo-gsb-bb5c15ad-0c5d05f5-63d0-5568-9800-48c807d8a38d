import type { RedactionBox, ReviewStatus } from '../types';
import type { ReviewCounts } from '../pdf/review';

interface Props {
  /** 仍需处理的遮盖（待复核 / 需调整），按原始页号升序分组 */
  groups: Array<{ page: number; boxes: RedactionBox[] }>;
  counts: ReviewCounts;
  currentPage: number;
  selectedId: string | null;
  /** 点击条目：跳页、切到选择模式并选中该遮盖框 */
  onLocate(page: number, boxId: string): void;
  /** 逐项 / 整页标记复核状态；每次调用整批只产生一条撤销记录 */
  onMark(ids: string[], status: ReviewStatus): void;
  onJump(page: number): void;
  onClose(): void;
}

/**
 * 本地复核面板：按原始页号列出仍需处理的遮盖（待复核 / 需调整）。
 * 点击条目跳页定位；逐项或整页标记「已通过」/「需调整」。
 * 全部遮盖「已通过」后才允许导出安全 PDF（导出时仍有待办会被拦截，不可跳过）。
 */
export function ReviewPanel(props: Props) {
  const { counts, groups } = props;
  const blockers = counts.pending + counts.changesRequested;

  return (
    <aside className="find-panel review-panel">
      <div className="find-head">
        <span className="find-title">复核</span>
        <button className="find-close" onClick={props.onClose} title="关闭面板" aria-label="关闭">
          ×
        </button>
      </div>

      <div className="find-hint">
        新建、批量生成或修改过的遮盖都需要复核；全部标记「已通过」后才能导出安全 PDF。
        「需调整」项被修改后会自动回到「待复核」。
      </div>

      <div className="review-summary">
        <span className="review-count pending">待复核 {counts.pending}</span>
        <span className="review-count changes">需调整 {counts.changesRequested}</span>
        <span className="review-count approved">已通过 {counts.approved}</span>
        <span className="dim">共 {counts.total} 处</span>
      </div>

      {counts.total === 0 && (
        <div className="find-status dim">当前文档还没有任何遮盖；请先绘制或生成遮盖后再复核。</div>
      )}

      {counts.total > 0 && blockers === 0 && (
        <div className="find-status ok">全部遮盖均已通过复核，可以导出安全 PDF。</div>
      )}

      {blockers > 0 && (
        <div className="find-status warn">
          还有 {counts.pending} 处待复核、{counts.changesRequested} 处需调整；
          全部标记「已通过」后才能导出（此拦截不可跳过）。
        </div>
      )}

      <div className="find-results">
        {groups.map((g) => {
          const ids = g.boxes.map((b) => b.id);
          return (
            <div
              key={g.page}
              className={`find-group${g.page === props.currentPage ? ' current' : ''}`}
            >
              <div className="find-group-head">
                <div className="find-group-title">
                  <button
                    type="button"
                    className="find-page-link"
                    onClick={() => props.onJump(g.page)}
                  >
                    第 {g.page} 页
                  </button>
                  <span className="dim">{g.boxes.length} 项</span>
                </div>
                <div className="review-page-actions">
                  <button
                    type="button"
                    onClick={() => props.onMark(ids, 'approved')}
                    title="把本页列出的全部遮盖标记为已通过（整批一条撤销记录）"
                  >
                    整页通过
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onMark(ids, 'changes-requested')}
                    title="把本页列出的全部遮盖标记为需调整（整批一条撤销记录）"
                  >
                    整页需调整
                  </button>
                </div>
              </div>
              <ul className="find-hit-list">
                {g.boxes.map((b, i) => (
                  <li
                    key={b.id}
                    className={`review-item${props.selectedId === b.id ? ' selected' : ''}`}
                  >
                    <code
                      className="find-snippet"
                      title="点击跳页并选中该遮盖框"
                      onClick={() => props.onLocate(g.page, b.id)}
                    >
                      框 {i + 1}　{formatBox(b)}
                      <span className={`review-badge ${b.review}`}>
                        {b.review === 'pending' ? '待复核' : '需调整'}
                      </span>
                    </code>
                    <span className="review-item-actions">
                      <button
                        type="button"
                        className="review-approve"
                        onClick={() => props.onMark([b.id], 'approved')}
                        title="复核无误，标记为已通过"
                      >
                        通过
                      </button>
                      <button
                        type="button"
                        className="review-reject"
                        disabled={b.review === 'changes-requested'}
                        onClick={() => props.onMark([b.id], 'changes-requested')}
                        title="复核发现问题，标记为需调整"
                      >
                        需调整
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/** 遮盖框坐标摘要：左上角位置 + 宽 × 高（点，取整） */
function formatBox(b: RedactionBox): string {
  const r = (n: number) => Math.round(n);
  return `(${r(b.x1)}, ${r(b.y1)}) ${r(b.x2 - b.x1)}×${r(b.y2 - b.y1)}`;
}
