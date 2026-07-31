'use client';

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

async function waitForImages(element: HTMLElement) {
  const images = Array.from(element.querySelectorAll('img'));

  await Promise.all(images.map(image => new Promise<void>(resolve => {
    if (image.complete) {
      resolve();
      return;
    }

    image.onload = () => resolve();
    image.onerror = () => resolve();
  })));
}

export async function generateClientPdfFromElement(element: HTMLElement) {
  await waitForImages(element);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const ratio = canvas.width / canvas.height;
  const widthInPdf = pdfWidth;
  const heightInPdf = widthInPdf / ratio;
  const y = heightInPdf < pdfHeight ? (pdfHeight - heightInPdf) / 2 : 0;

  pdf.addImage(imgData, 'PNG', 0, y, widthInPdf, heightInPdf);
  return pdf;
}

export async function generateClientPdfBase64FromElement(element: HTMLElement) {
  const pdf = await generateClientPdfFromElement(element);
  return pdf.output('datauristring').split(',')[1];
}

export async function saveClientPdfFromElement(element: HTMLElement, filename: string) {
  const pdf = await generateClientPdfFromElement(element);
  pdf.save(filename);
}
