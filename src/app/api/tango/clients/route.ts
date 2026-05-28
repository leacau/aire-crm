import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const company = searchParams.get('company'); // 5 para SRL, 6 para Digital

    if (!company) {
        return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    try {
        const response = await fetch('http://srv-tango-n:17000/Api/GetApiLiveQueryData', {
            method: 'POST', // Tango suele requerir POST si mandas body con --data, o lo pasamos por URL
            headers: {
                'ApiAuthorization': '995c8a42-bd4a-4f74-bcf3-88c826a954ec',
                'Company': company,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'process=17961&fromDate=&toDate=&pageSize=2000&pageIndex=0&customQuery=0',
            // Le pedimos hasta 2000 resultados de golpe para que traiga todos los clientes en 1 sola página
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
