import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { RedactionMap } from '../types';
import { PageThumbnail } from './PageThumbnail';

interface Props {
  pdf: PDFDocumentProxy;
  current: number;
  redactions: RedactionMap;
  onSelect(pageNum: number): void;
}

/**
 * 左侧页面列表：始终按**原始页号**顺序排列，点击跳转到对应原页。
 * 导出顺序 / 排除在「导出页序」面板中编排，不影响这里。
 */
export function PageList({ pdf, current, redactions, onSelect }: Props) {
  return (
    <aside className="page-list">
      {Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          className={`thumb${n === current ? ' active' : ''}`}
          onClick={() => onSelect(n)}
        >
          <PageThumbnail pdf={pdf} pageNum={n} />
          <div className="thumb-meta">
            <span>第 {n} 页</span>
            {redactions[n]?.length > 0 && (
              <span className="badge">{redactions[n]!.length} 处遮盖</span>
            )}
          </div>
        </button>
      ))}
    </aside>
  );
}
