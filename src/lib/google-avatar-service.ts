
'use server';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const ROOT_FOLDER_NAME = 'CRM-AIRE';
const CONFIG_FOLDER_NAME = 'config';

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
    
    let fileId: string;

    if (searchData.files && searchData.files.length > 0) {
        // File exists, update it
        fileId = searchData.files[0].id;
        const updateResponse = await fetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': file.type,
            },
            body: file,
        });

        if (!updateResponse.ok) {
            const error = await updateResponse.json();
            console.error('Google Drive API Error (Update):', error);
            throw new Error('Failed to update file in Google Drive: ' + (error.error?.message || 'Unknown error'));
        }
        const updatedFileData = await updateResponse.json();
        fileId = updatedFileData.id;

    } else {
        // File does not exist, create it
        const fileMetadata = {
            name: fileName,
            parents: [configFolderId],
        };

        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
        formData.append('file', file);

        const createResponse = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: formData,
        });
        
        if (!createResponse.ok) {
             const error = await createResponse.json();
             console.error('Google Drive API Error (Upload):', error);
             throw new Error('Failed to upload file to Google Drive: ' + (error.error?.message || 'Unknown error'));
        }
        const createdFileData = await createResponse.json();
        fileId = createdFileData.id;
    }


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
