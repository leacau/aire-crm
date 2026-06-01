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
import { getAllBillingRequestsWithMetadata, updateBillingRequestStatus, getWorkflowAssignments } from '@/lib/firebase-service';
import { format } from 'date-fns';
import { Clock, Send, CheckCircle2, Link, FileCheck2, UserCheck } from 'lucide-react';
import { AdvertisingOrderViewer } from '@/components/publicidad/advertising-viewer';

export default function BillingRequestsPage() {
    const { userInfo, getGoogleAccessToken } = useAuth();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [allRequests, setAllRequests] = useState<any[]>([]);
    
    // Estados de configuración de roles dinámicos
    const [isReceptor, setIsReceptor] = useState(false);
    
    // Estados para asentar número de factura
    const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({});

    useEffect(() => {
        if (userInfo) {
            getWorkflowAssignments().then(config => {
                // Evaluamos si el usuario logueado está marcado en la matriz como receptor oficial
                setIsReceptor(config.billingReceptors.includes(userInfo.id));
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

    // 🟢 ACCIÓN DEL ASESOR: Solicitar la facturación
    const handleRequestBilling = async (id: string) => {
        setProcessingId(id);
        try {
            const token = await getGoogleAccessToken();
            await updateBillingRequestStatus(id, 'Solicitado', {
                emailPayload: { accessToken: token || '', loggedUser: userInfo!.name }
            });
            toast({ title: 'Solicitud enviada', description: 'Se notificó al área de administración para confeccionar la factura.' });
            loadData();
        } catch (e) {
            toast({ title: 'Error al enviar solicitud', variant: 'destructive' });
        } finally {
            setProcessingId(null);
        }
    };

    // 🟢 ACCIÓN DEL RECEPTOR: Asentar el número real de Tango y cerrar el circuito
    const handleConfectInvoice = async (id: string) => {
        const noReal = invoiceNumbers[id]?.trim();
        if (!noReal) {
            toast({ title: 'Número requerido', description: 'Por favor, escribe el número de comprobante de Tango.', variant: 'destructive' });
            return;
        }
        setProcessingId(id);
        try {
            await updateBillingRequestStatus(id, 'Confeccionado', { invoiceNumber: noReal });
            toast({ title: 'Factura asentada', description: 'El comprobante se movió a la bandeja de Confeccionadas.' });
            loadData();
        } catch (e) {
            toast({ title: 'Error al registrar', variant: 'destructive' });
        } finally {
            setProcessingId(null);
        }
    };

    if (!userInfo) return <Spinner />;

    // 🟢 FILTRADO INTELIGENTE POR ROLES
    // Si es asesor puro (y no es receptor), solo ve sus líneas. Si es receptor, ve todo el canal.
    const myRequests = allRequests.filter(r => isReceptor ? true : r.advisorId === userInfo.id);

    const bandSugeridas = myRequests.filter(r => r.billingStatus === 'Sugerido');
    const bandSolicitadas = myRequests.filter(r => r.billingStatus === 'Solicitado');
    const bandConfeccionadas = myRequests.filter(r => r.billingStatus === 'Confeccionado');

    const renderTable = (data: any[], tabType: 'sugerido' | 'solicitado' | 'confeccionado') => (
        <div className="bg-white border rounded-md shadow-sm overflow-hidden">
            <Table>
                <TableHeader className="bg-slate-100">
                    <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Anunciante / Cliente</TableHead>
                        <TableHead>CUIT</TableHead>
                        <TableHead>Asesor</TableHead>
                        <TableHead className="text-right">Monto Neto</TableHead>
                        <TableHead>Condición</TableHead>
                        <TableHead className="text-center">Contrato</TableHead>
                        <TableHead className="text-right w-[200px]">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.length === 0 && (
                        <TableRow><TableCell colSpan={9} className="text-center py-10 text-slate-400 font-medium">No hay comprobantes en esta bandeja.</TableCell></TableRow>
                    )}
                    {data.map((row) => {
                        const isProcessing = processingId === row.id;
                        return (
                            <TableRow key={row.id}>
                                <TableCell className="font-medium text-xs whitespace-nowrap">{format(new Date(row.date + 'T12:00:00'), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>
                                    <Badge className={row.company === 'SRL' ? 'bg-purple-100 text-purple-800' : row.company === 'SAS' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'}>
                                        {row.company}
                                    </Badge>
                                </TableCell>
                                <TableCell className="font-bold text-slate-700 text-xs max-w-[200px] truncate" title={row.clientDisplayName}>{row.clientDisplayName}</TableCell>
                                <TableCell className="text-xs font-mono">{row.cuit}</TableCell>
                                <TableCell className="text-xs">{row.accountExecutive}</TableCell>
                                <TableCell className="text-right font-mono font-bold text-xs text-blue-800">${Number(row.amount || 0).toLocaleString('es-AR')}</TableCell>
                                <TableCell className="text-[11px]">
                                    <span className="font-semibold block">{row.paymentType}</span>
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
                                    {tabType === 'solicitado' && isReceptor && (
                                        <div className="flex gap-2 items-center justify-end">
                                            <Input 
                                                placeholder="N° Comprobante Tango" 
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
                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">En revisión contable</Badge>
                                    )}
                                    {tabType === 'confeccionado' && (
                                        <div className="text-right font-mono font-bold text-xs text-green-700">
                                            Factura: {row.invoiceNumber}
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
            <Header title="Centro de Control de Facturación Directa" />
            
            <main className="flex-1 overflow-auto p-4 md:p-8 max-w-7xl mx-auto w-full">
                {loading ? <div className="py-20 flex justify-center"><Spinner size="large" /></div> : (
                    <Tabs defaultValue={isReceptor ? "solicitado" : "sugerido"} className="w-full">
                        <TabsList className="mb-6 flex w-fit gap-2">
                            {/* Los receptores no ven las sugerencias, solo los pedidos reales */}
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
                )}
            </main>
        </div>
    );
}
