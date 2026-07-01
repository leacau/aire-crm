import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';

const DEFAULT_TANGO_BASE_URL = 'https://040896-002.connect.axoft.com';
const ALLOWED_COMPANIES = ['4', '5', '6'];

const getTangoEndpoint = () => {
    const configuredValue = process.env.TANGO_API_BASE_URL?.trim();
    const cleanValue = configuredValue?.replace(/^["']|["']$/g, '') || DEFAULT_TANGO_BASE_URL;

    try {
        const url = new URL(cleanValue);
        url.pathname = '/Api/GetApiLiveQueryData';
        url.search = '';
        return url;
    } catch {
        return new URL('/Api/GetApiLiveQueryData', DEFAULT_TANGO_BASE_URL);
    }
};

export async function GET(request: Request) {
    const serverUser = await requireServerManagement(request);
    if (isServerResponse(serverUser)) return serverUser;

    const { searchParams } = new URL(request.url);
    const company = searchParams.get('company');
    const apiAuthorization = process.env.TANGO_API_AUTHORIZATION;

    if (!company) {
        return NextResponse.json({ error: 'Falta el ID de Company' }, { status: 400 });
    }

    if (!ALLOWED_COMPANIES.includes(company)) {
        return NextResponse.json({ error: 'Company no permitida' }, { status: 400 });
    }

    if (!apiAuthorization) {
        return NextResponse.json({ error: 'Configuracion de Tango incompleta' }, { status: 500 });
    }

    try {
        // 🟢 CORRECCIÓN: Tango usa GET y los datos viajan en la URL (por el flag -G)
        const tangoUrl = getTangoEndpoint();
        tangoUrl.searchParams.set('process', '17961');
        tangoUrl.searchParams.set('fromDate', '');
        tangoUrl.searchParams.set('toDate', '');
        tangoUrl.searchParams.set('pageSize', '2000');
        tangoUrl.searchParams.set('pageIndex', '0');
        tangoUrl.searchParams.set('customQuery', '0');

        console.log(`Conectando a Tango (Company ${company})... URL: ${tangoUrl.toString()}`);

        const response = await fetch(tangoUrl, {
            method: 'GET',
            headers: {
                'ApiAuthorization': apiAuthorization,
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
