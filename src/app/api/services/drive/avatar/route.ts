import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { externalServiceErrorResponse } from '@/app/api/services/utils';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const ROOT_FOLDER_NAME = 'CRM-AIRE';
const CONFIG_FOLDER_NAME = 'config';

function sanitizeFileName(name: string): string {
  if (!name) return 'archivo-sin-nombre';
  return name.replace(/[/\\]/g, '-').trim();
}

async function readGoogleError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  return payload?.error?.message || payload?.error || fallback;
}

async function findOrCreateFolder(accessToken: string, folderName: string, parentId?: string): Promise<string> {
  let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and trashed=false`;
  query += parentId ? ` and '${parentId}' in parents` : " and 'root' in parents";

  const searchResponse = await fetch(`${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=files(id, name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchResponse.ok) {
    throw new Error(await readGoogleError(searchResponse, `Error buscando la carpeta '${folderName}'.`));
  }

  const searchData = await searchResponse.json();
  const exactMatch = Array.isArray(searchData.files)
    ? searchData.files.find((file: { name: string }) => file.name === folderName)
    : null;
  if (exactMatch?.id) return exactMatch.id;

  const folderMetadata: { name: string; mimeType: string; parents?: string[] } = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) folderMetadata.parents = [parentId];

  const createResponse = await fetch(`${DRIVE_API_URL}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(folderMetadata),
  });

  if (!createResponse.ok) {
    throw new Error(await readGoogleError(createResponse, `Error al crear la carpeta '${folderName}'.`));
  }

  const createData = await createResponse.json();
  return createData.id;
}

export async function POST(req: Request) {
  try {
    const serverUser = await requireServerUser(req);
    if (isServerResponse(serverUser)) return serverUser;

    const accessToken = req.headers.get('x-google-access-token');
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'La imagen es obligatoria.' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'El archivo debe ser una imagen.' }, { status: 400 });
    }

    const rootFolderId = await findOrCreateFolder(accessToken, ROOT_FOLDER_NAME);
    const configFolderId = await findOrCreateFolder(accessToken, CONFIG_FOLDER_NAME, rootFolderId);
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const fileName = `${serverUser.uid}.${fileExtension}`;
    const searchQuery = `'${configFolderId}' in parents and name='${fileName}' and trashed=false`;
    const searchResponse = await fetch(`${DRIVE_API_URL}/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!searchResponse.ok) {
      throw new Error(await readGoogleError(searchResponse, 'No se pudo buscar la imagen existente.'));
    }

    const searchData = await searchResponse.json();
    const existingFileId = Array.isArray(searchData.files) ? searchData.files[0]?.id : null;
    const method: 'POST' | 'PATCH' = existingFileId ? 'PATCH' : 'POST';
    const resumableUrl = existingFileId
      ? `${DRIVE_UPLOAD_URL}/${existingFileId}?uploadType=resumable`
      : `${DRIVE_UPLOAD_URL}?uploadType=resumable`;

    const initResponse = await fetch(resumableUrl, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(method === 'POST' ? { name: sanitizeFileName(fileName), parents: [configFolderId] } : {}),
    });

    if (!initResponse.ok) {
      throw new Error(await readGoogleError(initResponse, 'No se pudo iniciar la subida de la imagen.'));
    }

    const locationUrl = initResponse.headers.get('Location');
    if (!locationUrl) {
      throw new Error('Google Drive no devolvio URL de subida.');
    }

    const uploadResponse = await fetch(locationUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes 0-${file.size - 1}/${file.size}`,
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(await readGoogleError(uploadResponse, 'No se pudo subir la imagen a Google Drive.'));
    }

    const uploadedFileData = await uploadResponse.json();
    const fileId = uploadedFileData.id;

    await fetch(`${DRIVE_API_URL}/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });

    return NextResponse.json({ url: `https://lh3.googleusercontent.com/d/${fileId}?t=${Date.now()}` });
  } catch (error) {
    return externalServiceErrorResponse(error, {
      service: 'GOOGLE DRIVE',
      action: 'UPLOAD AVATAR',
      publicError: 'No se pudo subir la imagen de perfil a Google Drive.',
    });
  }
}
