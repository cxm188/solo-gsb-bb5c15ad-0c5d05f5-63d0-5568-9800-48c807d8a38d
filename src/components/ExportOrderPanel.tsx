import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { RedactionMap } from '../types';
import type { PageOrder } from '../pdf/pageOrder';
import { includedPages } from '../pdf/pageOrder';
import { PageThumbnail } from './PageThumbnail';

interface Props {
  pdf: PDFDocumentProxy;
  order: PageOrder;
  /** 当前编辑器所在的原始页号 */
  currentPage: number;
  redactions: RedactionMap;
  onMove(page: number, delta: -1 | 1): void;
  onToggleExcluded(page: number): void;
  onReset(): void;
  onJump(page: number): void;
  onClose(): void;
}

/**
 * 导出页序面板：以缩略图列表编排导出 PDF 时的页面顺序，可上移 / 下移、
 * 排除 / 恢复页面。列表每一行与每一处遮盖都始终用**原始页号**标识，
 * 因此重排后缩略图上的遮盖计数、点击跳页都指向正确原页；
 * 被排除的页面仍保留在排列中（置灰占位），恢复后回到原位。
 */
export function ExportOrderPanel(props: Props) {
  const { order, redactions } = props;
  const kept = includedPages(order);
  const keptSet = new Set(kept);

  return (
    <aside className="find-panel order-panel">
      <div className="find-head">
        <span className="find-title">导出页序</span>
        <button className="find-close" onClick={props.onClose} title="关闭面板" aria-label="关闭">
          ×
        </button>
      </div>

      <div className="find-hint">
        调整页面在导出 PDF 中的先后顺序，或排除暂不导出的页面；只影响导出，
        不影响遮盖编辑，也不会写入遮盖方案。
      </div>

      <div className="order-summary">
        导出 <strong>{kept.length}</strong> / {order.ordered.length} 页
        <button type="button" className="repeat-link-btn" onClick={props.onReset}>
          恢复默认页序
        </button>
      </div>

      <div className="order-list">
        {order.ordered.map((page, idx) => {
          const excluded = order.excluded.has(page);
          const pos = keptSet.has(page) ? kept.indexOf(page) + 1 : null;
          const count = redactions[page]?.length ?? 0;
          return (
            <div
              key={page}
              className={
                `order-row${excluded ? ' excluded' : ''}` +
                (page === props.currentPage ? ' current' : '')
              }
            >
              <div className="order-pos" title="该原页在导出 PDF 中的页码">
                {pos === null ? '—' : pos}
              </div>
              <button
                type="button"
                className="order-thumb"
                onClick={() => props.onJump(page)}
                title={`跳转到原始第 ${page} 页`}
              >
                <PageThumbnail pdf={props.pdf} pageNum={page} width={92} />
              </button>
              <div className="order-info">
                <button
                  type="button"
                  className="find-page-link"
                  onClick={() => props.onJump(page)}
                >
                  原第 {page} 页
                </button>
                <span className="dim">
                  {count > 0 ? `${count} 处遮盖` : '无遮盖'}
                  {excluded ? ' · 已排除，不导出' : ''}
                </span>
                <div className="order-controls">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => props.onMove(page, -1)}
                    title="在导出顺序中上移"
                  >
                    ↑ 上移
                  </button>
                  <button
                    type="button"
                    disabled={idx === order.ordered.length - 1}
                    onClick={() => props.onMove(page, 1)}
                    title="在导出顺序中下移"
                  >
                    ↓ 下移
                  </button>
                  <button
                    type="button"
                    className={excluded ? '' : 'danger-outline'}
                    onClick={() => props.onToggleExcluded(page)}
                    title={excluded ? '恢复该页，重新参与导出' : '排除该页，导出时跳过'}
                  >
                    {excluded ? '恢复' : '排除'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
