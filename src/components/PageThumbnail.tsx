import { useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** 缩略图默认渲染宽度（CSS 像素） */
export const THUMB_WIDTH = 132;

interface Props {
  pdf: PDFDocumentProxy;
  /** 始终为原始页号（PDF 物理页），与编排无关 */
  pageNum: number;
  width?: number;
}

/**
 * 单页缩略图：按固定宽度等比渲染原页位图。
 * 卸载 / 页码变化时取消进行中的渲染任务。
 */
export function PageThumbnail({ pdf, pageNum, width = THUMB_WIDTH }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel(): void } | undefined;
    (async () => {
      const page = await pdf.getPage(pageNum);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const renderTask = page.render({ canvasContext: ctx, viewport });
      task = renderTask;
      await renderTask.promise.catch(() => {
        /* 取消时忽略 */
      });
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNum, width]);

  return <canvas ref={canvasRef} />;
}
