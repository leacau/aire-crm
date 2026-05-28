import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const company = searchParams.get('company');

    if (!company) {
        return NextResponse.json({ error: 'Falta el ID de Company' }, { status: 400 });
    }

    try {
        // 🟢 CORRECCIÓN: Tango usa GET y los datos viajan en la URL (por el flag -G)
        const tangoUrl = 'https://040896-002.connect.axoft.com/Api/GetApiLiveQueryData?process=17961&fromDate=&toDate=&pageSize=2000&pageIndex=0&customQuery=0';

        console.log(`Conectando a Tango (Company ${company})... URL: ${tangoUrl}`);

        const response = await fetch(tangoUrl, {
            method: 'GET',
            headers: {
                'ApiAuthorization': 'ab921495-0c29-4c12-a425-c507ee917228',
                'Company': company,
            },
            // fetch en Next.js a veces cachea de forma agresiva. Le pedimos que siempre traiga datos frescos:
            cache: 'no-store' 
        });

        if (!response.ok) {
            const textError = await response.text();
            throw new Error(`Tango rechazó la conexión (Status ${response.status}). Detalles: ${textError}`);
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error('🔥 Error crítico conectando a Tango:', error);
        
        return NextResponse.json({ 
            error: 'Fallo de conexión con Tango', 
            details: error.message,
            hint: 'Si el error dice "ENOTFOUND srv-tango-n", significa que el CRM está alojado en la nube y no tiene acceso a la red local de la radio. Debes reemplazar "srv-tango-n" por la IP Pública del servidor.'
        }, { status: 500 });
    }
}
