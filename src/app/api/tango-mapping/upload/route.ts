import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { tangoMappingErrorResponse } from '@/app/api/tango-mapping/errors';

export const runtime = 'nodejs';
const MAX_ROWS = 200;
const MAX_MATCHES = 200;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const serverUser = await requireServerManagement(req);
  if (isServerResponse(serverUser)) return serverUser;

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const searchTerm = (formData.get('q') as string | null)?.toLowerCase().trim();

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'Archivo no recibido' }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'El archivo supera el limite permitido' }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'buffer', dense: true });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      return NextResponse.json({ error: 'No se encontro hoja en el archivo' }, { status: 400 });
    }

    const worksheet = workbook.Sheets[firstSheet];
    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Hoja vacia' }, { status: 400 });
    }

    const headers = (rows[0] || []).map((h) => (h === undefined ? '' : String(h)));

    if (searchTerm) {
      const matches: any[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowLower = row.map((cell) => (cell === undefined || cell === null ? '' : String(cell).toLowerCase()));
        const found = rowLower.some((cell) => cell.includes(searchTerm));
        if (found) {
          const obj: Record<string, any> = {};
          headers.forEach((header, colIdx) => {
            obj[header || `Columna ${colIdx + 1}`] = row[colIdx] ?? '';
          });
          matches.push({ __row: i - 1, ...obj });
        }
        if (matches.length >= MAX_MATCHES) break;
      }

      return NextResponse.json({
        headers,
        rows: matches,
        totalRows: Math.max(rows.length - 1, 0),
        truncated: matches.length >= MAX_MATCHES,
        search: searchTerm,
      });
    }

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
  } catch (error) {
    return tangoMappingErrorResponse(error, {
      action: 'UPLOAD',
      requesterId: serverUser.uid,
      publicError: 'No se pudo procesar el archivo de mapeo Tango.',
    });
  }
}
