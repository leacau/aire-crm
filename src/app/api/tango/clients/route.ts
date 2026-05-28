import { NextResponse } from 'next/server';
//haciendo que funcione

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const company = searchParams.get('company'); // 5 para SRL, 6 para Digital

    if (!company) {
        return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    try {
        // En un GET, los parámetros van directamente en la URL
        const tangoUrl = 'http://srv-tango-n:17000/Api/GetApiLiveQueryData?process=17961&fromDate=&toDate=&pageSize=2000&pageIndex=0&customQuery=0';

        const response = await fetch(tangoUrl, {
            method: 'GET', // Usamos GET como en el curl original
            headers: {
                'ApiAuthorization': '995c8a42-bd4a-4f74-bcf3-88c826a954ec',
                'Company': company,
                // Content-Type no es necesario en un GET porque no hay "body"
            }
        });

        if (!response.ok) {
            throw new Error(`Tango API responded with status ${response.status}`);
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error('Error fetching from Tango:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
