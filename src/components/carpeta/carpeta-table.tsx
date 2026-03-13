'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getInvoicesForClient, getOpportunitiesByClientId, createInvoice, updateInvoice, getClient, getBillingRequestsByClient } from '@/lib/firebase-service';
import type { Invoice, Opportunity, CarpetaBillingStatus } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { startOfMonth, endOfMonth, parseISO, format } from 'date-fns';
import { Save, Plus } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';

interface RowData {
    id?: string;
    opportunityId: string;
    opportunityTitle: string;
    month: string; // YYYY-MM
    concept: string; // Explicación o Propuesta
    amount: number | '';
    orderDate: string;
    orderNumber: string;
    date: string; // Fecha factura
    invoiceNumber: string;
    isDraft: boolean; 
    billingRequestId?: string;
    status: CarpetaBillingStatus;
}

export function CarpetaTable({ clientId, clientName }: { clientId: string, clientName: string }) {
    const { userInfo, isBoss } = useAuth();
    const { toast } = useToast();
    const [rows, setRows] = useState<RowData[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [activeOpps, setActiveOpps] = useState<Opportunity[]>([]);

    const isAdmin = userInfo?.role === 'Administracion' || userInfo?.role === 'Admin' || userInfo?.email === 'lchena@airedesantafe.com.ar';
    const isAsesor = userInfo?.role === 'Asesor';

    // Permisos según reglas solicitadas:
    const canEditAsesorFields = isBoss || isAsesor || isAdmin; // Jefe, Asesor (o Admin si asume el rol)
    const canEditAdminFields = isBoss || isAdmin; // Jefe o Admin
    const canEditFacturaFields = isBoss || isAsesor || isAdmin; // Ambos pueden completar la factura

    useEffect(() => {
        loadData();
    }, [clientId]);

    const calculateStatus = (orderNumber?: string, invoiceNumber?: string, date?: string): CarpetaBillingStatus => {
        if (invoiceNumber && date) return 'Facturado';
        if (orderNumber) return 'Pedido Realizado';
        return 'Pendiente de Pedido';
    };

    const getStatusBadge = (status: CarpetaBillingStatus) => {
        switch (status) {
            case 'Facturado':
                return <Badge className="bg-emerald-500 hover:bg-emerald-600">Facturado</Badge>;
            case 'Pedido Realizado':
                return <Badge className="bg-blue-500 hover:bg-blue-600">Pedido Efectivizado</Badge>;
            case 'Pendiente de Pedido':
                return <Badge className="bg-amber-500 hover:bg-amber-600">Pendiente de Pedido</Badge>;
        }
    };

    const loadData = async () => {
        setLoading(true);

        const [allOpps, allInvoices, allBillingRequests] = await Promise.all([
            getOpportunitiesByClientId(clientId),
            getInvoicesForClient(clientId),
            getBillingRequestsByClient(clientId)
        ]);

        const activeOppsList = allOpps.filter(opp => opp.stage === 'Cerrado - Ganado');
        setActiveOpps(activeOppsList);

        const newRows: RowData[] = [];

        // 1. Agregamos TODAS las facturas existentes
        allInvoices.forEach(inv => {
            const opp = allOpps.find(o => o.id === inv.opportunityId);
            const monthStr = inv.month || (inv.periodStart ? inv.periodStart.substring(0, 7) : '');
            
            newRows.push({
                id: inv.id,
                opportunityId: inv.opportunityId,
                opportunityTitle: opp?.title || 'Desconocida',
                month: monthStr,
                concept: inv.concept || opp?.title || '',
                amount: inv.amount,
                orderDate: inv.orderDate || '',
                orderNumber: inv.orderNumber || '',
                date: inv.date || '',
                invoiceNumber: inv.invoiceNumber || '',
                isDraft: false,
                billingRequestId: inv.billingRequestId,
                status: calculateStatus(inv.orderNumber, inv.invoiceNumber, inv.date)
            });
        });

        // 2. Agregamos los pedidos de facturación (Billing Requests)
        allBillingRequests.forEach(br => {
            const alreadyInvoiced = allInvoices.some(inv => inv.billingRequestId === br.id);
            if (!alreadyInvoiced) {
                const opp = allOpps.find(o => o.id === br.opportunityId);
                const brDate = br.date ? parseISO(br.date) : new Date();
                
                newRows.push({
                    opportunityId: br.opportunityId,
                    opportunityTitle: opp?.title || 'Desconocida',
                    month: format(brDate, 'yyyy-MM'),
                    concept: opp?.title || 'Generado automático',
                    amount: br.amount,
                    orderDate: '',
                    orderNumber: '',
                    date: '', 
                    invoiceNumber: '',
                    isDraft: true,
                    billingRequestId: br.id,
                    status: 'Pendiente de Pedido'
                });
            }
        });

        // 3. Ordenamos CRONOLÓGICAMENTE por mes, o si no, date de la factura.
        newRows.sort((a, b) => {
            const dateA = a.month ? `${a.month}-01` : (a.date || '2099-01-01'); 
            const dateB = b.month ? `${b.month}-01` : (b.date || '2099-01-01');
            return new Date(dateB).getTime() - new Date(dateA).getTime(); // Más recientes primero
        });

        setRows(newRows);
        setLoading(false);
    };

    const handleRowChange = (index: number, field: keyof RowData, value: string | number) => {
        const newRows = [...rows];
        newRows[index] = { ...newRows[index], [field]: value };
        
        // Recalcular estado si cambian campos clave
        if (field === 'orderNumber' || field === 'invoiceNumber' || field === 'date') {
            newRows[index].status = calculateStatus(
                field === 'orderNumber' ? value as string : newRows[index].orderNumber,
                field === 'invoiceNumber' ? value as string : newRows[index].invoiceNumber,
                field === 'date' ? value as string : newRows[index].date
            );
        }
        
        setRows(newRows);
    };

    const handleSaveRow = async (index: number) => {
        if (!userInfo) return;
        const row = rows[index];
        
        if (!row.month) {
            toast({ title: "Atención", description: "Debe colocar el Mes de la factura.", variant: "destructive" });
            return;
        }

        setSavingId(index.toString());
        try {
            const clientOwner = (await getClient(clientId))?.ownerName || 'Desconocido';
            
            // Reconstruimos periodStart y End para mantener retrocompatibilidad en BD
            const periodStartStr = row.month ? `${row.month}-01` : '';
            const periodEndStr = row.month ? format(endOfMonth(parseISO(`${row.month}-01`)), 'yyyy-MM-dd') : '';

            const payload = {
                opportunityId: row.opportunityId || 'manual', // En caso de ser fila manual libre
                periodStart: periodStartStr,
                periodEnd: periodEndStr,
                month: row.month,
                concept: row.concept,
                amount: Number(row.amount) || 0,
                orderDate: row.orderDate,
                orderNumber: row.orderNumber,
                date: row.date,
                invoiceNumber: row.invoiceNumber,
                status: (row.invoiceNumber && row.date) ? 'Generada' as const : 'Pendiente' as const,
                billingRequestId: row.billingRequestId || null
            };

            if (row.id && !row.isDraft) {
                await updateInvoice(row.id, payload, userInfo.id, userInfo.name, clientOwner);
                toast({ title: "Guardado", description: "Registro actualizado." });
            } else {
                const newId = await createInvoice(payload as Omit<Invoice, 'id'>, userInfo.id, userInfo.name, clientOwner);
                const updatedRows = [...rows];
                updatedRows[index].id = newId;
                updatedRows[index].isDraft = false;
                setRows(updatedRows);
                toast({ title: "Guardado", description: "Nuevo registro en carpeta creado." });
            }
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "No se pudo guardar la fila.", variant: "destructive" });
        } finally {
            setSavingId(null);
        }
    };

    const addManualRow = () => {
        setRows([{
            opportunityId: '',
            opportunityTitle: '',
            month: format(new Date(), 'yyyy-MM'),
            concept: '',
            amount: '',
            orderDate: '',
            orderNumber: '',
            date: '',
            invoiceNumber: '',
            isDraft: true,
            status: 'Pendiente de Pedido'
        }, ...rows]);
    };

    if (loading) return <div className="flex justify-center p-8"><Spinner /></div>;

    return (
        <div className="space-y-4">
            <div className="border rounded-md bg-white shadow-sm overflow-x-auto">
                <Table className="min-w-[1200px]">
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="w-[140px]">Mes</TableHead>
                            <TableHead className="min-w-[250px]">Concepto / Propuesta</TableHead>
                            <TableHead className="w-[120px]">Monto ($)</TableHead>
                            <TableHead className="w-[220px]">Fecha y Nº Pedido</TableHead>
                            <TableHead className="w-[220px]">Fecha y Nº Factura</TableHead>
                            <TableHead className="w-[140px]">Estado</TableHead>
                            <TableHead className="w-[80px]">Acción</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row, i) => (
                            <TableRow key={row.id || `draft-${i}`} className={row.isDraft ? "bg-amber-50/20" : ""}>
                                {/* MES */}
                                <TableCell className="p-2 border-r">
                                    <Input 
                                        type="month" 
                                        value={row.month} 
                                        onChange={e => handleRowChange(i, 'month', e.target.value)} 
                                        className="h-8 text-xs w-full" 
                                        disabled={!canEditAsesorFields} 
                                    />
                                </TableCell>
                                
                                {/* CONCEPTO */}
                                <TableCell className="p-2 border-r space-y-1">
                                    <Input 
                                        placeholder="Breve explicación..." 
                                        value={row.concept} 
                                        onChange={e => handleRowChange(i, 'concept', e.target.value)} 
                                        className="h-8 text-xs w-full" 
                                        disabled={!canEditAsesorFields} 
                                    />
                                    {row.isDraft && !row.opportunityId && activeOpps.length > 0 && (
                                        <Select value={row.opportunityId} onValueChange={v => {
                                            handleRowChange(i, 'opportunityId', v);
                                            const title = activeOpps.find(o => o.id === v)?.title || '';
                                            handleRowChange(i, 'opportunityTitle', title);
                                            if(!row.concept) handleRowChange(i, 'concept', title);
                                        }}>
                                            <SelectTrigger className="h-7 text-[10px] w-full"><SelectValue placeholder="Vincular Propuesta..."/></SelectTrigger>
                                            <SelectContent>
                                                {activeOpps.map(opp => (
                                                    <SelectItem key={opp.id} value={opp.id}>{opp.title}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                    {row.opportunityId && row.opportunityTitle && (
                                        <div className="text-[10px] text-muted-foreground flex justify-between">
                                            <span>Vinculado a: {row.opportunityTitle}</span>
                                        </div>
                                    )}
                                </TableCell>

                                {/* MONTO */}
                                <TableCell className="p-2 border-r">
                                    <Input 
                                        type="number" 
                                        value={row.amount} 
                                        onChange={e => handleRowChange(i, 'amount', e.target.value)} 
                                        className="h-8 text-xs font-mono text-right" 
                                        disabled={!canEditAsesorFields} 
                                    />
                                </TableCell>

                                {/* PEDIDO */}
                                <TableCell className="p-2 border-r">
                                    <div className="flex gap-1 items-center">
                                        <Input 
                                            type="date" 
                                            value={row.orderDate} 
                                            onChange={e => handleRowChange(i, 'orderDate', e.target.value)} 
                                            className="h-8 text-xs w-full" 
                                            disabled={!canEditAsesorFields} 
                                            title="Fecha Pedido" 
                                        />
                                        <Input 
                                            placeholder="Nº Pedido" 
                                            value={row.orderNumber} 
                                            onChange={e => handleRowChange(i, 'orderNumber', e.target.value)} 
                                            className="h-8 text-xs w-full" 
                                            disabled={!canEditAdminFields} 
                                        />
                                    </div>
                                </TableCell>

                                {/* FACTURA */}
                                <TableCell className="p-2 border-r">
                                    <div className="flex gap-1 items-center">
                                        <Input 
                                            type="date" 
                                            value={row.date} 
                                            onChange={e => handleRowChange(i, 'date', e.target.value)} 
                                            className="h-8 text-xs w-full" 
                                            disabled={!canEditFacturaFields} 
                                            title="Fecha Factura" 
                                        />
                                        <Input 
                                            placeholder="Nº Factura" 
                                            value={row.invoiceNumber} 
                                            onChange={e => handleRowChange(i, 'invoiceNumber', e.target.value)} 
                                            className="h-8 text-xs w-full" 
                                            disabled={!canEditFacturaFields} 
                                        />
                                    </div>
                                </TableCell>

                                {/* ESTADO */}
                                <TableCell className="p-2 border-r text-center">
                                    {getStatusBadge(row.status)}
                                </TableCell>

                                {/* ACCIÓN */}
                                <TableCell className="p-2 text-center">
                                    <Button size="sm" onClick={() => handleSaveRow(i)} disabled={savingId === i.toString()}>
                                        {savingId === i.toString() ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {rows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">La carpeta de facturación está vacía.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            
            {canEditAsesorFields && (
                <Button variant="outline" onClick={addManualRow}>
                    <Plus className="h-4 w-4 mr-2" /> Agregar Fila Manual
                </Button>
            )}
        </div>
    );
}
