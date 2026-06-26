'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Clock, FileCheck2, Link, Loader2, Send } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { AdvertisingOrderViewer } from '@/components/publicidad/advertising-viewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import {
  getBillingRequestContext,
  getBillingRequests,
  transitionBillingRequest,
  type BillingRequestStatus,
  type BillingRequestWithMetadata,
} from '@/modules/billing/client';

type BillingRequestTab = 'sugerido' | 'solicitado' | 'confeccionado';

const statusLabels: Partial<Record<BillingRequestStatus, string>> = {
  Solicitado: 'Recibido por Coordinación',
  Elevado: 'Elevado a Contaduría',
};

export default function BillingRequestsPage() {
  const { userInfo, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [allRequests, setAllRequests] = useState<BillingRequestWithMetadata[]>([]);
  const [isReceptor, setIsReceptor] = useState(false);
  const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [context, requests] = await Promise.all([
        getBillingRequestContext(),
        getBillingRequests(),
      ]);
      setIsReceptor(context.isBillingReceptor);
      setAllRequests(requests);
    } catch (error) {
      console.error('Error loading billing requests:', error);
      toast({ title: 'Error al cargar la facturación', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (userInfo) void loadData();
  }, [loadData, userInfo]);

  const transitionRequest = async (
    id: string,
    status: BillingRequestStatus,
    options: { invoiceNumber?: string; successTitle: string; successDescription: string; errorTitle: string },
  ) => {
    setProcessingId(id);
    try {
      const token = await getGoogleAccessToken();
      await transitionBillingRequest(id, {
        status,
        invoiceNumber: options.invoiceNumber,
        emailPayload: { accessToken: token || '', loggedUser: userInfo?.name || '' },
      });
      toast({ title: options.successTitle, description: options.successDescription });
      await loadData();
    } catch (error) {
      console.error(`Error transitioning billing request to ${status}:`, error);
      toast({
        title: options.errorTitle,
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRequestBilling = (id: string) => transitionRequest(id, 'Solicitado', {
    successTitle: 'Factura solicitada',
    successDescription: 'El pedido fue enviado a coordinación.',
    errorTitle: 'Error al solicitar facturación',
  });

  const handleElevateBilling = (id: string) => transitionRequest(id, 'Elevado', {
    successTitle: 'Pedido elevado',
    successDescription: 'Se aprobó el pedido y se notificó a administración.',
    errorTitle: 'Error al elevar el pedido',
  });

  const handleConfectInvoice = (id: string) => {
    const invoiceNumber = invoiceNumbers[id]?.trim();
    if (!invoiceNumber) {
      toast({
        title: 'Número requerido',
        description: 'Por favor, escribí el número de comprobante Tango.',
        variant: 'destructive',
      });
      return;
    }

    void transitionRequest(id, 'Confeccionado', {
      invoiceNumber,
      successTitle: 'Factura asentada',
      successDescription: 'Se guardó el comprobante y se notificó al asesor.',
      errorTitle: 'Error al registrar',
    });
  };

  if (!userInfo) return <Spinner />;

  const myRequests = allRequests.filter(request => isReceptor || request.advisorId === userInfo.id);
  const suggestedRequests = myRequests.filter(request => request.billingStatus === 'Sugerido');
  const requestedRequests = myRequests.filter(request =>
    request.billingStatus === 'Solicitado' || request.billingStatus === 'Elevado',
  );
  const completedRequests = myRequests.filter(request => request.billingStatus === 'Confeccionado');

  const renderTable = (data: BillingRequestWithMetadata[], tabType: BillingRequestTab) => (
    <div className="overflow-hidden rounded-md border bg-white shadow-sm">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow>
            <TableHead>Fecha progr.</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Anunciante / Razón Social</TableHead>
            <TableHead>CUIT</TableHead>
            <TableHead>Asesor</TableHead>
            <TableHead className="text-right">Monto Neto</TableHead>
            <TableHead>Condición de Cobro</TableHead>
            <TableHead className="text-center">Contrato</TableHead>
            <TableHead className="w-[240px] text-right">Acción / Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center font-medium text-slate-400">
                No hay documentos en esta bandeja.
              </TableCell>
            </TableRow>
          )}
          {data.map(row => {
            const isProcessing = processingId === row.id;
            return (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-xs font-medium">
                  {row.date ? format(new Date(`${row.date}T12:00:00`), 'dd/MM/yyyy') : '-'}
                </TableCell>
                <TableCell>
                  <Badge className={
                    row.company === 'SRL' ? 'border-purple-200 bg-purple-100 text-purple-800'
                      : row.company === 'SAS' ? 'border-blue-200 bg-blue-100 text-blue-800'
                        : 'border-slate-200 bg-slate-100 text-slate-800'
                  }>
                    {row.company || '-'}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-xs font-bold text-slate-700" title={row.clientDisplayName}>
                  {row.clientDisplayName}
                </TableCell>
                <TableCell className="font-mono text-xs">{row.cuit}</TableCell>
                <TableCell className="text-xs">{row.accountExecutive}</TableCell>
                <TableCell className="text-right font-mono text-xs font-bold text-blue-800">
                  ${Number(row.amount || 0).toLocaleString('es-AR')}
                </TableCell>
                <TableCell className="text-[11px]">
                  <span className="block font-semibold">{row.paymentType || 'Se paga'}</span>
                  {row.canjeDescription && (
                    <span className="block max-w-[120px] truncate italic text-slate-500" title={row.canjeDescription}>
                      {row.canjeDescription}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <AdvertisingOrderViewer order={{ id: row.orderId } as any} />
                </TableCell>
                <TableCell className="text-right">
                  {tabType === 'sugerido' && (
                    <Button size="sm" className="h-8 bg-blue-600 text-xs font-bold hover:bg-blue-700" onClick={() => handleRequestBilling(row.id)} disabled={isProcessing}>
                      {isProcessing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                      Solicitar Factura
                    </Button>
                  )}

                  {tabType === 'solicitado' && isReceptor && row.billingStatus === 'Solicitado' && (
                    <Button size="sm" className="h-8 bg-amber-600 text-xs font-bold hover:bg-amber-700" onClick={() => handleElevateBilling(row.id)} disabled={isProcessing}>
                      {isProcessing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                      Aprobar y Elevar
                    </Button>
                  )}
                  {tabType === 'solicitado' && isReceptor && row.billingStatus === 'Elevado' && (
                    <div className="flex items-center justify-end gap-2">
                      <Input
                        placeholder="N° Factura Tango"
                        className="h-8 w-36 bg-white font-mono text-xs"
                        value={invoiceNumbers[row.id] || ''}
                        onChange={event => setInvoiceNumbers(current => ({ ...current, [row.id]: event.target.value }))}
                      />
                      <Button size="sm" className="h-8 bg-green-600 text-xs font-bold hover:bg-green-700" onClick={() => handleConfectInvoice(row.id)} disabled={isProcessing}>
                        {isProcessing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <FileCheck2 className="mr-1 h-3 w-3" />}
                        Asentar
                      </Button>
                    </div>
                  )}

                  {tabType === 'solicitado' && !isReceptor && (
                    <Badge variant="outline" className={row.billingStatus === 'Solicitado' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-blue-200 bg-blue-50 text-blue-700'}>
                      {statusLabels[row.billingStatus] || row.billingStatus}
                    </Badge>
                  )}

                  {tabType === 'confeccionado' && (
                    <div className="inline-block rounded border border-green-200 bg-green-50 px-2 py-1 text-right font-mono text-xs font-bold text-green-700">
                      Comprobante: {row.invoiceNumber || '-'}
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
    <div className="flex h-full flex-col bg-slate-50">
      <Header title="Bandeja de Control de Facturación" />

      <main className="mx-auto w-full max-w-7xl flex-1 overflow-auto p-4 md:p-8">
        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center">
            <Spinner size="large" />
          </div>
        ) : (
          <Tabs defaultValue={isReceptor ? 'solicitado' : 'sugerido'} className="w-full">
            <TabsList className="mb-6 flex w-fit gap-2">
              {!isReceptor && (
                <TabsTrigger value="sugerido" className="font-bold data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <Clock className="mr-2 h-4 w-4" /> 1. Facturas Sugeridas ({suggestedRequests.length})
                </TabsTrigger>
              )}
              <TabsTrigger value="solicitado" className="font-bold data-[state=active]:bg-amber-500 data-[state=active]:text-white">
                <Link className="mr-2 h-4 w-4" /> 2. Pedidos Realizados ({requestedRequests.length})
              </TabsTrigger>
              <TabsTrigger value="confeccionado" className="font-bold data-[state=active]:bg-green-600 data-[state=active]:text-white">
                <CheckCircle2 className="mr-2 h-4 w-4" /> 3. Confeccionadas ({completedRequests.length})
              </TabsTrigger>
            </TabsList>

            {!isReceptor && (
              <TabsContent value="sugerido">{renderTable(suggestedRequests, 'sugerido')}</TabsContent>
            )}
            <TabsContent value="solicitado">{renderTable(requestedRequests, 'solicitado')}</TabsContent>
            <TabsContent value="confeccionado">{renderTable(completedRequests, 'confeccionado')}</TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
