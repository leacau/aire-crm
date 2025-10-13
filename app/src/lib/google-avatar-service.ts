
'use server';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const ROOT_FOLDER_NAME = 'CRM-AIRE';
const CONFIG_FOLDER_NAME = 'config';

// Sanitize file names to remove invalid characters for Google Drive
function sanitizeFileName(name: string): string {
    if (!name) return 'archivo-sin-nombre';
    // Replace only characters that are invalid for Drive file names.
    return name.replace(/[/\\]/g, '-').trim();
}


async function findOrCreateFolder(accessToken: string, folderName: string, parentId?: string): Promise<string> {
    let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and trashed=false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    } else {
        query += ` and 'root' in parents`;
    }
    
    const searchResponse = await fetch(`${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=files(id, name)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        throw new Error(`Error buscando la carpeta '${folderName}'. Estado: ${searchResponse.status}. Detalle: ${errorText}`);
    }

    const searchData = await searchResponse.json();
    if (searchData.files && searchData.files.length > 0) {
        const exactMatch = searchData.files.find((f: {name: string}) => f.name === folderName);
        if (exactMatch) {
            return exactMatch.id;
        }
    }

    // Folder not found, create it
    const folderMetadata: { name: string; mimeType: string; parents?: string[] } = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) {
        folderMetadata.parents = [parentId];
    }
    
    const createResponse = await fetch(`${DRIVE_API_URL}/files`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(folderMetadata)
    });

    if (!createResponse.ok) {
        const error = await createResponse.json();
        console.error("Error creando la carpeta", error);
        throw new Error(`Error al crear la carpeta '${folderName}'.`);
    }

    const createData = await createResponse.json();
    return createData.id;
}


export async function uploadAvatarToDrive(accessToken: string, file: File, userId: string): Promise<string> {
    const rootFolderId = await findOrCreateFolder(accessToken, ROOT_FOLDER_NAME);
    const configFolderId = await findOrCreateFolder(accessToken, CONFIG_FOLDER_NAME, rootFolderId);

    const fileExtension = file.name.split('.').pop();
    const fileName = `${userId}.${fileExtension}`;

    // Search for existing file for this user
    const searchQuery = `'${configFolderId}' in parents and name='${fileName}' and trashed=false`;
    const searchResponse = await fetch(`${DRIVE_API_URL}/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)`, {
         headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const searchData = await searchResponse.json();
    
    let resumableUrl: string;
    let method: 'POST' | 'PATCH';

    if (searchData.files && searchData.files.length > 0) {
        // File exists, initiate resumable update
        const fileId = searchData.files[0].id;
        method = 'PATCH';
        resumableUrl = `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=resumable`;
    } else {
        // File does not exist, initiate resumable create
        method = 'POST';
        resumableUrl = `${DRIVE_UPLOAD_URL}?uploadType=resumable`;
    }
    
    const fileMetadata = { name: sanitizeFileName(fileName), parents: [configFolderId] };

    const initResponse = await fetch(resumableUrl, {
        method: method,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(method === 'POST' ? fileMetadata : {}),
    });

    if (!initResponse.ok) {
        const errorData = await initResponse.json().catch(() => ({}));
        console.error('Failed to initiate avatar upload.', errorData);
        throw new Error('Failed to initiate avatar upload: ' + (errorData?.error?.message || initResponse.statusText));
    }
    const locationUrl = initResponse.headers.get('Location');
    
    if (!locationUrl) {
        throw new Error('Could not get resumable URL for avatar upload.');
    }

    // Upload the file content to the resumable URL
    const uploadResponse = await fetch(locationUrl, {
        method: 'PUT',
        headers: { 
            'Content-Range': `bytes 0-${file.size - 1}/${file.size}`,
        },
        body: file,
    });

    if (!uploadResponse.ok) {
        const error = await uploadResponse.json().catch(() => ({})); // Catch if response is not JSON
        console.error('Google Drive API Error (Avatar Upload):', error);
        throw new Error('Failed to upload avatar to Google Drive: ' + (error.error?.message || 'Unknown error'));
    }

    const uploadedFileData = await uploadResponse.json();
    const fileId = uploadedFileData.id;


    // Make the file publicly readable
    await fetch(`${DRIVE_API_URL}/files/${fileId}/permissions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            role: 'reader',
            type: 'anyone'
        })
    });
    
    // Bust cache by adding a timestamp
    return `https://lh3.googleusercontent.com/d/${fileId}?t=${new Date().getTime()}`;
}
