'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { getAllBillingRequestsWithMetadata, updateBillingRequestStatus } from '@/lib/api/billing-requests';
import { getWorkflowAssignments } from '@/lib/api/system';
import { hasManagementPrivileges } from '@/lib/role-utils';
import { format } from 'date-fns';
import { Clock, Send, CheckCircle2, Link, FileCheck2, Loader2 } from 'lucide-react'; 
import { AdvertisingOrderViewer } from '@/components/publicidad/advertising-viewer';

export default function BillingRequestsPage() {
    const { userInfo, getGoogleAccessToken } = useAuth();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [allRequests, setAllRequests] = useState<any[]>([]);
    const [isReceptor, setIsReceptor] = useState(false);
    const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({});

    useEffect(() => {
        if (userInfo) {
            getWorkflowAssignments().then(config => {
                setIsReceptor(config.billingReceptors.includes(userInfo.id) || hasManagementPrivileges(userInfo));
                loadData();
            });
        }
    }, [userInfo]);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getAllBillingRequestsWithMetadata();
            setAllRequests(data);
        } catch (e) {
            toast({ title: 'Error al cargar la facturación', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    // 1. ASESOR -> RECEPTOR (Pasa a Solicitado y notifica por mail)
    const handleRequestBilling = async (id: string) => {
        setProcessingId(id);
        try {
            const token = await getGoogleAccessToken();
            await updateBillingRequestStatus(id, 'Solicitado', {
                emailPayload: { accessToken: token || '', loggedUser: userInfo!.name }
            });
            toast({ title: 'Factura Solicitada', description: 'El pedido fue enviado a coordinación.' });
            loadData();
        } catch (e) {
            toast({ title: 'Error al solicitar facturación', variant: 'destructive' });
        } finally {
            setProcessingId(null);
        }
    };

    // 2. RECEPTOR -> FACTURADOR (Pasa a Elevado y envía correo a contabilidad)
    const handleElevateBilling = async (id: string) => {
        setProcessingId(id);
        try {
            const token = await getGoogleAccessToken();
            await updateBillingRequestStatus(id, 'Elevado', {
                emailPayload: { accessToken: token || '', loggedUser: userInfo!.name }
            });
            toast({ title: 'Pedido Elevado', description: 'Se aprobó el pedido y se notificó a administración.' });
            loadData();
        } catch (e) {
            toast({ title: 'Error al elevar el pedido', variant: 'destructive' });
        } finally {
            setProcessingId(null);
        }
    };

    // 3. RECEPTOR -> ASESOR (Pasa a Confeccionado, asigna número de Tango y notifica al vendedor)
    const handleConfectInvoice = async (id: string) => {
        const noReal = invoiceNumbers[id]?.trim();
        if (!noReal) {
            toast({ title: 'Número requerido', description: 'Por favor, escribe el número de comprobante Tango.', variant: 'destructive' });
            return;
        }
        setProcessingId(id);
        try {
            const token = await getGoogleAccessToken();
            await updateBillingRequestStatus(id, 'Confeccionado', { 
                invoiceNumber: noReal,
                emailPayload: { accessToken: token || '', loggedUser: userInfo!.name }
            });
            toast({ title: 'Factura asentada', description: 'Se guardó el comprobante y se notificó al asesor.' });
            loadData();
        } catch (e) {
            toast({ title: 'Error al registrar', variant: 'destructive' });
        } finally {
            setProcessingId(null);
        }
    };

    if (!userInfo) return <Spinner />;

    const myRequests = allRequests.filter(r => isReceptor ? true : r.advisorId === userInfo.id);

    const bandSugeridas = myRequests.filter(r => r.billingStatus === 'Sugerido');
    const bandSolicitadas = myRequests.filter(r => r.billingStatus === 'Solicitado' || r.billingStatus === 'Elevado');
    const bandConfeccionadas = myRequests.filter(r => r.billingStatus === 'Confeccionado');

    const renderTable = (data: any[], tabType: 'sugerido' | 'solicitado' | 'confeccionado') => (
        <div className="bg-white border rounded-md shadow-sm overflow-hidden">
            <Table>
                <TableHeader className="bg-slate-50">
                    <TableRow>
                        <TableHead>Fecha Progr.</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Anunciante / Razón Social</TableHead>
                        <TableHead>CUIT</TableHead>
                        <TableHead>Asesor</TableHead>
                        <TableHead className="text-right">Monto Neto</TableHead>
                        <TableHead>Condición de Cobro</TableHead>
                        <TableHead className="text-center">Contrato</TableHead>
                        <TableHead className="text-right w-[240px]">Acción / Estado</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.length === 0 && (
                        <TableRow><TableCell colSpan={9} className="text-center py-10 text-slate-400 font-medium">No hay documentos en esta bandeja.</TableCell></TableRow>
                    )}
                    {data.map((row) => {
                        const isProcessing = processingId === row.id;
                        return (
                            <TableRow key={row.id}>
                                <TableCell className="font-medium text-xs whitespace-nowrap">{format(new Date(row.date + 'T12:00:00'), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>
                                    <Badge className={row.company === 'SRL' ? 'bg-purple-100 text-purple-800 border-purple-200' : row.company === 'SAS' ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-slate-100 text-slate-800 border-slate-200'}>
                                        {row.company}
                                    </Badge>
                                </TableCell>
                                <TableCell className="font-bold text-slate-700 text-xs max-w-[200px] truncate" title={row.clientDisplayName}>{row.clientDisplayName}</TableCell>
                                <TableCell className="text-xs font-mono">{row.cuit}</TableCell>
                                <TableCell className="text-xs">{row.accountExecutive}</TableCell>
                                <TableCell className="text-right font-mono font-bold text-xs text-blue-800">${Number(row.amount || 0).toLocaleString('es-AR')}</TableCell>
                                <TableCell className="text-[11px]">
                                    <span className="font-semibold block">{row.paymentType || 'Se paga'}</span>
                                    {row.canjeDescription && <span className="text-slate-500 italic block truncate max-w-[120px]" title={row.canjeDescription}>{row.canjeDescription}</span>}
                                </TableCell>
                                <TableCell className="text-center">
                                    <AdvertisingOrderViewer order={{ id: row.orderId } as any} />
                                </TableCell>
                                <TableCell className="text-right">
                                    {tabType === 'sugerido' && (
                                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-8 text-xs font-bold" onClick={() => handleRequestBilling(row.id)} disabled={isProcessing}>
                                            {isProcessing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                                            Solicitar Factura
                                        </Button>
                                    )}
                                    
                                    {tabType === 'solicitado' && isReceptor && row.billingStatus === 'Solicitado' && (
                                        <Button size="sm" className="bg-amber-600 hover:bg-amber-700 h-8 text-xs font-bold" onClick={() => handleElevateBilling(row.id)} disabled={isProcessing}>
                                            {isProcessing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                                            Aprobar y Elevar
                                        </Button>
                                    )}
                                    {tabType === 'solicitado' && isReceptor && row.billingStatus === 'Elevado' && (
                                        <div className="flex gap-2 items-center justify-end">
                                            <Input 
                                                placeholder="N° Factura Tango" 
                                                className="w-36 h-8 text-xs bg-white font-mono" 
                                                value={invoiceNumbers[row.id] || ''}
                                                onChange={e => setInvoiceNumbers({ ...invoiceNumbers, [row.id]: e.target.value })}
                                            />
                                            <Button size="sm" className="bg-green-600 hover:bg-green-700 h-8 text-xs font-bold" onClick={() => handleConfectInvoice(row.id)} disabled={isProcessing}>
                                                {isProcessing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <FileCheck2 className="w-3 h-3 mr-1" />}
                                                Asentar
                                            </Button>
                                        </div>
                                    )}

                                    {tabType === 'solicitado' && !isReceptor && (
                                        <Badge variant="outline" className={row.billingStatus === 'Solicitado' ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"}>
                                            {row.billingStatus === 'Solicitado' ? "Recibido por Coordinación" : "Elevado a Contaduría"}
                                        </Badge>
                                    )}

                                    {tabType === 'confeccionado' && (
                                        <div className="text-right font-mono font-bold text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded inline-block">
                                            Comprobante: {row.invoiceNumber}
                                        </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <Header title="Bandeja de Control de Facturación" />
            
            <main className="flex-1 overflow-auto p-4 md:p-8 max-w-7xl mx-auto w-full">
                <Tabs defaultValue={isReceptor ? "solicitado" : "sugerido"} className="w-full">
                    <TabsList className="mb-6 flex w-fit gap-2">
                        {!isReceptor && (
                            <TabsTrigger value="sugerido" className="font-bold data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                                <Clock className="w-4 h-4 mr-2" /> 1. Facturas Sugeridas ({bandSugeridas.length})
                            </TabsTrigger>
                        )}
                        <TabsTrigger value="solicitado" className="font-bold data-[state=active]:bg-amber-500 data-[state=active]:text-white">
                            <Link className="w-4 h-4 mr-2" /> 2. Pedidos Realizados ({bandSolicitadas.length})
                        </TabsTrigger>
                        <TabsTrigger value="confeccionado" className="font-bold data-[state=active]:bg-green-600 data-[state=active]:text-white">
                            <CheckCircle2 className="w-4 h-4 mr-2" /> 3. Confeccionadas ({bandConfeccionadas.length})
                        </TabsTrigger>
                    </TabsList>

                    {!isReceptor && (
                        <TabsContent value="sugerido">{renderTable(bandSugeridas, 'sugerido')}</TabsContent>
                    )}
                    <TabsContent value="solicitado">{renderTable(bandSolicitadas, 'solicitado')}</TabsContent>
                    <TabsContent value="confeccionado">{renderTable(bandConfeccionadas, 'confeccionado')}</TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
