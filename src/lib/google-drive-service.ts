
'use server';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_NAME = 'CRM-Aire';
const SUBFOLDER_NAME = 'configuracion';

async function findOrCreateFolder(accessToken: string, folderName: string, parentId?: string): Promise<string> {
    const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false` + (parentId ? ` and '${parentId}' in parents` : '');
    
    const searchResponse = await fetch(`${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!searchResponse.ok) {
        throw new Error('Failed to search for folder in Google Drive.');
    }

    const searchData = await searchResponse.json();
    if (searchData.files.length > 0) {
        return searchData.files[0].id;
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
        throw new Error('Failed to create folder in Google Drive.');
    }

    const createData = await createResponse.json();
    return createData.id;
}

export async function uploadFileToDrive(accessToken: string, file: File): Promise<string> {
    const mainFolderId = await findOrCreateFolder(accessToken, FOLDER_NAME);
    const subFolderId = await findOrCreateFolder(accessToken, SUBFOLDER_NAME, mainFolderId);

    const fileMetadata = {
        name: `profile-pic-${Date.now()}.${file.name.split('.').pop()}`,
        parents: [subFolderId],
    };

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    formData.append('file', file);

    const response = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
        body: formData,
    });
    
    if (!response.ok) {
         const error = await response.json();
         console.error('Google Drive API Error (Upload):', error);
         throw new Error('Failed to upload file to Google Drive: ' + (error.error?.message || 'Unknown error'));
    }

    const uploadedFileData = await response.json();
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
    
    // Return the web view link for direct embedding
    return `https://lh3.googleusercontent.com/d/${fileId}`;
}
