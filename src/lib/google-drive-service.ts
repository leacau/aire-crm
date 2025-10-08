
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

    // Step 1: Initiate a resumable upload session
    const initResponse = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=resumable`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(fileMetadata),
    });

    if (!initResponse.ok) {
        const error = await initResponse.json();
        console.error('Google Drive API Error (Init Resumable):', error);
        throw new Error('Failed to initiate file upload session: ' + (error.error?.message || 'Unknown error'));
    }

    const locationUrl = initResponse.headers.get('Location');
    if (!locationUrl) {
        throw new Error('Failed to get resumable upload URL from Google Drive.');
    }

    // Step 2: Upload the file content
    const uploadResponse = await fetch(locationUrl, {
        method: 'PUT',
        headers: {
            'Content-Length': file.size.toString(),
        },
        body: file,
    });
    
    if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        console.error('Google Drive API Error (Upload):', error);
        throw new Error('Failed to upload file to Google Drive: ' + (error.error?.message || 'Unknown error'));
    }

    const uploadedFileData = await uploadResponse.json();
    const fileId = uploadedFileData.id;

    // Step 3: Make the file publicly readable
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
    
    // Return the web view link for direct embedding/linking
    return `https://lh3.googleusercontent.com/d/${fileId}`;
}


export async function deleteFileFromDrive(accessToken: string, fileUrl: string) {
    const fileIdMatch = fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!fileIdMatch || !fileIdMatch[1]) {
        throw new Error('Invalid Google Drive file URL for deletion.');
    }
    const fileId = fileIdMatch[1];


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
