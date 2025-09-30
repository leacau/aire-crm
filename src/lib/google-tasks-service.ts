
'use server';

const TASKS_API_BASE_URL = 'https://www.googleapis.com/tasks/v1';

async function callTasksApi(accessToken: string, path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: object) {
    const url = `${TASKS_API_BASE_URL}${path}`;

    const response = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        ...(body && { body: JSON.stringify(body) })
    });

    if (!response.ok && response.status !== 204) {
        const error = await response.json();
        console.error(`Google Tasks API Error (${method} ${path}):`, error);
        throw new Error(`Failed to ${method} task: ` + (error.error?.message || 'Unknown error'));
    }

    return response.status === 204 ? null : await response.json();
}


export async function getTaskLists(accessToken: string) {
    const data = await callTasksApi(accessToken, '/users/@me/lists');
    return data.items || [];
}

export async function getTasks(accessToken: string, tasklistId: string) {
    const data = await callTasksApi(accessToken, `/lists/${tasklistId}/tasks?showCompleted=false`);
    return data.items || [];
}

export async function createTask(accessToken: string, tasklistId: string, task: { title: string, notes?: string, due?: string }) {
    return await callTasksApi(accessToken, `/lists/${tasklistId}/tasks`, 'POST', task);
}

export async function updateTask(accessToken: string, tasklistId: string, taskId: string, task: object) {
    return await callTasksApi(accessToken, `/lists/${tasklistId}/tasks/${taskId}`, 'PUT', task);
}

export async function deleteTask(accessToken: string, tasklistId: string, taskId: string) {
    return await callTasksApi(accessToken, `/lists/${tasklistId}/tasks/${taskId}`, 'DELETE');
}
