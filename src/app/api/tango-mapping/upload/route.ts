import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
const MAX_ROWS = 12000;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Archivo no recibido' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'buffer', dense: true });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    return NextResponse.json({ error: 'No se encontró hoja en el archivo' }, { status: 400 });
  }

  const worksheet = workbook.Sheets[firstSheet];
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Hoja vacía' }, { status: 400 });
  }

  const headers = (rows[0] || []).map((h) => (h === undefined ? '' : String(h)));
  const dataRows = rows.slice(1, MAX_ROWS + 1).map((row, idx) => {
    const obj: Record<string, any> = {};
    headers.forEach((header, colIdx) => {
      obj[header || `Columna ${colIdx + 1}`] = row[colIdx] ?? '';
    });
    return { __row: idx, ...obj };
  });

  return NextResponse.json({
    headers,
    rows: dataRows,
    totalRows: Math.max(rows.length - 1, 0),
    truncated: rows.length - 1 > dataRows.length,
  });
}
