import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { tangoErrorResponse, tangoMissingConfigResponse } from '@/app/api/tango/utils';

const ALLOWED_COMPANIES = ['4', '5', '6'];

const getTangoEndpoint = () => {
    const configuredValue = process.env.TANGO_API_BASE_URL?.trim();
    const cleanValue = configuredValue?.replace(/^["']|["']$/g, '');

    if (!cleanValue) {
        throw new Error('Falta configurar TANGO_API_BASE_URL');
    }

    try {
        const url = new URL(cleanValue);
        url.pathname = '/Api/GetApiLiveQueryData';
        url.search = '';
        return url;
    } catch {
        throw new Error('TANGO_API_BASE_URL no es una URL valida');
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
        return tangoMissingConfigResponse('TANGO_API_AUTHORIZATION');
    }

    try {
        const tangoUrl = getTangoEndpoint();
        tangoUrl.searchParams.set('process', '17961');
        tangoUrl.searchParams.set('fromDate', '');
        tangoUrl.searchParams.set('toDate', '');
        tangoUrl.searchParams.set('pageSize', '2000');
        tangoUrl.searchParams.set('pageIndex', '0');
        tangoUrl.searchParams.set('customQuery', '0');

        console.log(`Conectando a Tango (Company ${company})...`);

        const response = await fetch(tangoUrl, {
            method: 'GET',
            headers: {
                ApiAuthorization: apiAuthorization,
                Company: company,
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            const textError = await response.text();
            throw new Error(`Tango rechazo la conexion (Status ${response.status}). Detalles: ${textError}`);
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        return tangoErrorResponse(error, {
            action: 'CLIENTS LIST',
            requesterId: serverUser.uid,
            publicError: 'Fallo de conexion con Tango',
        });
    }
}
