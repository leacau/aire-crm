import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type PaginatedPdfOptions = {
  imageQuality?: number;
  scale?: number;
};

const MIN_PAGE_SLICE_HEIGHT = 120;

const createSliceCanvas = (source: HTMLCanvasElement, startY: number, height: number) => {
  const sliceCanvas = document.createElement('canvas');
  sliceCanvas.width = source.width;
  sliceCanvas.height = height;

  const context = sliceCanvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar la pagina del PDF');

  context.drawImage(
    source,
    0,
    startY,
    source.width,
    height,
    0,
    0,
    source.width,
    height
  );

  return sliceCanvas;
};

export const generatePaginatedPdfFromElement = async (
  element: HTMLElement,
  options: PaginatedPdfOptions = {}
) => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const scale = options.scale ?? 2;
  const imageQuality = options.imageQuality ?? 0.82;

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  const elementRect = element.getBoundingClientRect();
  const pageHeightPx = Math.floor((canvas.width * pdfHeight) / pdfWidth);
  const pxToMm = pdfWidth / canvas.width;

  const keepTogetherRanges = Array.from(
    element.querySelectorAll<HTMLElement>('[data-pdf-keep-together="true"]')
  )
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        top: Math.max(0, Math.floor(((rect.top - elementRect.top) * canvas.height) / elementRect.height)),
        bottom: Math.min(canvas.height, Math.ceil(((rect.bottom - elementRect.top) * canvas.height) / elementRect.height)),
      };
    })
    .filter((range) => range.bottom > range.top && range.bottom - range.top < pageHeightPx * 0.9)
    .sort((a, b) => a.top - b.top);

  const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href]')).map((link) => {
    const rect = link.getBoundingClientRect();
    return {
      href: link.href,
      left: ((rect.left - elementRect.left) * canvas.width) / elementRect.width,
      top: ((rect.top - elementRect.top) * canvas.height) / elementRect.height,
      width: (rect.width * canvas.width) / elementRect.width,
      height: (rect.height * canvas.height) / elementRect.height,
    };
  });

  let startY = 0;
  let pageIndex = 0;

  while (startY < canvas.height) {
    let endY = Math.min(startY + pageHeightPx, canvas.height);

    if (endY < canvas.height) {
      const crossingRange = keepTogetherRanges.find(
        (range) => range.top < endY && range.bottom > endY && range.top > startY
      );

      if (crossingRange && crossingRange.top - startY >= MIN_PAGE_SLICE_HEIGHT) {
        endY = crossingRange.top;
      }
    }

    const sliceHeight = Math.max(1, endY - startY);
    const sliceCanvas = createSliceCanvas(canvas, startY, sliceHeight);
    const imageData = sliceCanvas.toDataURL('image/jpeg', imageQuality);
    const sliceHeightMm = sliceHeight * pxToMm;

    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imageData, 'JPEG', 0, 0, pdfWidth, sliceHeightMm);

    links.forEach((link) => {
      const linkBottom = link.top + link.height;
      if (link.width <= 0 || link.height <= 0 || link.top < startY || linkBottom > endY) return;

      pdf.link(
        link.left * pxToMm,
        (link.top - startY) * pxToMm,
        link.width * pxToMm,
        link.height * pxToMm,
        { url: link.href }
      );
    });

    startY = endY;
    pageIndex += 1;
  }

  return pdf;
};
