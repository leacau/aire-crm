
'use server';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const ROOT_FOLDER_NAME = 'CRM-AIRE';
const OPPORTUNITIES_FOLDER_NAME = 'Oportunidades';

// Sanitize folder names to remove invalid characters for Google Drive
function sanitizeFolderName(name: string): string {
    if (!name) return 'Sin Nombre';
    // Replace invalid characters with a hyphen. Invalid characters are / \ ? * < > : | " '
    return name.replace(/[\\/?*<>:|"]/g, '-').trim();
}


async function findOrCreateFolder(accessToken: string, folderName: string, parentId?: string): Promise<string> {
    const sanitizedName = sanitizeFolderName(folderName);
    let query = `mimeType='application/vnd.google-apps.folder' and name='${sanitizedName.replace(/'/g, "\\'")}' and trashed=false`;
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
        throw new Error(`Failed to search for folder '${sanitizedName}'. Status: ${searchResponse.status}. Body: ${errorText}`);
    }

    const searchData = await searchResponse.json();
    if (searchData.files && searchData.files.length > 0) {
        // Find the exact match in case Drive search is fuzzy
        const exactMatch = searchData.files.find((f: {name: string}) => f.name === sanitizedName);
        if (exactMatch) {
            return exactMatch.id;
        }
    }

    // Folder not found, create it
    const folderMetadata: { name: string; mimeType: string; parents?: string[] } = {
        name: sanitizedName,
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
        console.error("Error creating folder", error);
        throw new Error(`Failed to create folder '${sanitizedName}'.`);
    }

    const createData = await createResponse.json();
    return createData.id;
}

export async function uploadFileToDrive(accessToken: string, file: File, opportunityId: string): Promise<string> {
    const rootFolderId = await findOrCreateFolder(accessToken, ROOT_FOLDER_NAME);
    const opportunitiesFolderId = await findOrCreateFolder(accessToken, OPPORTUNITIES_FOLDER_NAME, rootFolderId);
    const opportunityFolderId = await findOrCreateFolder(accessToken, opportunityId, opportunitiesFolderId);

    const fileMetadata = {
        name: file.name,
        parents: [opportunityFolderId],
    };

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    formData.append('file', file);

    const response = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id`, {
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

export async function deleteFileFromDrive(accessToken: string, fileUrl: string) {
    const fileId = fileUrl.split('/d/')[1];
    if (!fileId) {
        throw new Error('Invalid Google Drive file URL for deletion.');
    }

    const response = await fetch(`${DRIVE_API_URL}/files/${fileId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok && response.status !== 204) {
        const error = await response.json();
        console.error('Google Drive API Error (Delete):', error);
        throw new Error('Failed to delete file from Google Drive: ' + (error.error?.message || 'Unknown error'));
    }
}
