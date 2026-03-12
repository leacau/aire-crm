'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getInvoicesForClient, getOpportunitiesByClientId, createInvoice, updateInvoice, getClient } from '@/lib/firebase-service';
import type { Invoice, Opportunity } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { startOfMonth, endOfMonth, parseISO, isWithinInterval, isSameMonth, addMonths, format } from 'date-fns';
import { Save, Plus } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface RowData {
    id?: string; // Invoice ID si ya existe
    opportunityId: string;
    opportunityTitle: string;
    periodStart: string;
    periodEnd: string;
    amount: number | '';
    orderDate: string;
    orderNumber: string;
    date: string; // Fecha factura
    invoiceNumber: string;
    isDraft: boolean; // True si viene de propuesta pero no tiene factura guardada aún
}

const getPeriodDurationInMonths = (period: string | string[] | undefined): number => {
    const p = Array.isArray(period) ? period[0] : (period || 'Ocasional');
    switch (p) {
        case 'Mensual': return 1;
        case 'Trimestral': return 3;
        case 'Semestral': return 6;
        case 'Anual': return 12;
        default: return 1;
    }
};

export function CarpetaTable({ clientId, clientName }: { clientId: string, clientName: string }) {
    const { userInfo } = useAuth();
    const { toast } = useToast();
    const [rows, setRows] = useState<RowData[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [activeOpps, setActiveOpps] = useState<Opportunity[]>([]);

    const isAdmin = userInfo?.role === 'Administracion' || userInfo?.role === 'Admin' || userInfo?.email === 'lchena@airedesantafe.com.ar';

    useEffect(() => {
        loadData();
    }, [clientId]);

    const loadData = async () => {
        setLoading(true);
        const currentMonthStart = startOfMonth(new Date());

        const [allOpps, allInvoices] = await Promise.all([
            getOpportunitiesByClientId(clientId),
            getInvoicesForClient(clientId)
        ]);

        // 1. Filtrar opps activas ESTE mes
        const activeThisMonth = allOpps.filter(opp => {
            if (opp.stage !== 'Cerrado - Ganado' || !opp.closeDate) return false;
            const referenceDate = opp.manualUpdateDate ? parseISO(opp.manualUpdateDate) : parseISO(opp.closeDate);

            if (opp.finalizationDate) {
                const startDate = startOfMonth(referenceDate);
                const endDate = endOfMonth(parseISO(opp.finalizationDate));
                return isWithinInterval(currentMonthStart, { start: startDate, end: endDate });
            }
            const durationMonths = getPeriodDurationInMonths(opp.periodicidad);
            if (durationMonths > 1) {
                const startDate = startOfMonth(referenceDate);
                const endDate = addMonths(startDate, durationMonths - 1);
                return isWithinInterval(currentMonthStart, { start: startDate, end: endDate });
            }
            return isSameMonth(currentMonthStart, referenceDate);
        });

        setActiveOpps(activeThisMonth);

        // 2. Filtrar facturas generadas ESTE mes (buscando coincidencias de facturas frescas)
        // Usamos facturas que tengan fecha de factura este mes, o si no, dateGenerated este mes.
        const currentMonthInvoices = allInvoices.filter(inv => {
            const dateToCheck = inv.date ? parseISO(inv.date) : parseISO(inv.dateGenerated);
            return isSameMonth(currentMonthStart, dateToCheck);
        });

        const newRows: RowData[] = [];

        // 3. Cruzar datos: Por cada Opp activa, buscar si tiene factura en este mes
        activeThisMonth.forEach(opp => {
            const relatedInvoices = currentMonthInvoices.filter(inv => inv.opportunityId === opp.id);
            
            if (relatedInvoices.length > 0) {
                relatedInvoices.forEach(inv => {
                    newRows.push({
                        id: inv.id,
                        opportunityId: opp.id,
                        opportunityTitle: opp.title,
                        periodStart: inv.periodStart || '',
                        periodEnd: inv.periodEnd || '',
                        amount: inv.amount,
                        orderDate: inv.orderDate || '',
                        orderNumber: inv.orderNumber || '',
                        date: inv.date || '',
                        invoiceNumber: inv.invoiceNumber || '',
                        isDraft: false
                    });
                });
            } else {
                // Borrador automático para la oportunidad activa
                newRows.push({
                    opportunityId: opp.id,
                    opportunityTitle: opp.title,
                    periodStart: '',
                    periodEnd: '',
                    amount: opp.value || '',
                    orderDate: '',
                    orderNumber: '',
                    date: '',
                    invoiceNumber: '',
                    isDraft: true
                });
            }
        });

        // 4. Agregar facturas huérfanas o manuales de este mes (que no estén en opps activas por X motivo)
        currentMonthInvoices.forEach(inv => {
            if (!newRows.some(r => r.id === inv.id)) {
                const parentOpp = allOpps.find(o => o.id === inv.opportunityId);
                newRows.push({
                    id: inv.id,
                    opportunityId: inv.opportunityId,
                    opportunityTitle: parentOpp?.title || 'Desconocida',
                    periodStart: inv.periodStart || '',
                    periodEnd: inv.periodEnd || '',
                    amount: inv.amount,
                    orderDate: inv.orderDate || '',
                    orderNumber: inv.orderNumber || '',
                    date: inv.date || '',
                    invoiceNumber: inv.invoiceNumber || '',
                    isDraft: false
                });
            }
        });

        setRows(newRows);
        setLoading(false);
    };

    const handleRowChange = (index: number, field: keyof RowData, value: string | number) => {
        const newRows = [...rows];
        newRows[index] = { ...newRows[index], [field]: value };
        setRows(newRows);
    };

    const handleSaveRow = async (index: number) => {
        if (!userInfo) return;
        const row = rows[index];
        
        if (!row.opportunityId) {
            toast({ title: "Error", description: "Debe seleccionar un concepto/propuesta.", variant: "destructive" });
            return;
        }

        setSavingId(index.toString());
        try {
            const clientOwner = (await getClient(clientId))?.ownerName || 'Desconocido';
            
            const payload = {
                opportunityId: row.opportunityId,
                periodStart: row.periodStart,
                periodEnd: row.periodEnd,
                amount: Number(row.amount) || 0,
                orderDate: row.orderDate,
                orderNumber: row.orderNumber,
                date: row.date,
                invoiceNumber: row.invoiceNumber,
                status: (row.invoiceNumber || row.date) ? 'Generada' as const : 'Pendiente' as const
            };

            if (row.id && !row.isDraft) {
                await updateInvoice(row.id, payload, userInfo.id, userInfo.name, clientOwner);
                toast({ title: "Guardado", description: "Fila actualizada." });
            } else {
                const newId = await createInvoice(payload as Omit<Invoice, 'id'>, userInfo.id, userInfo.name, clientOwner);
                const updatedRows = [...rows];
                updatedRows[index].id = newId;
                updatedRows[index].isDraft = false;
                setRows(updatedRows);
                toast({ title: "Guardado", description: "Factura registrada." });
            }
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "No se pudo guardar la fila.", variant: "destructive" });
        } finally {
            setSavingId(null);
        }
    };

    const addManualRow = () => {
        setRows([...rows, {
            opportunityId: '',
            opportunityTitle: '',
            periodStart: '',
            periodEnd: '',
            amount: '',
            orderDate: '',
            orderNumber: '',
            date: '',
            invoiceNumber: '',
            isDraft: true
        }]);
    };

    if (loading) return <div className="flex justify-center p-8"><Spinner /></div>;

    return (
        <div className="space-y-4">
            <div className="border rounded-md bg-white shadow-sm overflow-x-auto">
                <Table className="min-w-[1000px]">
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="w-[180px]">Período</TableHead>
                            <TableHead className="min-w-[200px]">Concepto (Propuesta)</TableHead>
                            <TableHead className="w-[120px]">Monto ($)</TableHead>
                            <TableHead className="w-[200px]">Pedido (Admin)</TableHead>
                            <TableHead className="w-[200px]">Factura (Asesor)</TableHead>
                            <TableHead className="w-[80px]">Acción</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row, i) => (
                            <TableRow key={row.id || `draft-${i}`} className={row.isDraft ? "bg-amber-50/30" : ""}>
                                {/* PERÍODO */}
                                <TableCell className="flex gap-1 items-center p-2">
                                    <Input type="date" value={row.periodStart} onChange={e => handleRowChange(i, 'periodStart', e.target.value)} className="h-8 text-xs w-[110px]" disabled={isAdmin} title="Desde" />
                                    <Input type="date" value={row.periodEnd} onChange={e => handleRowChange(i, 'periodEnd', e.target.value)} className="h-8 text-xs w-[110px]" disabled={isAdmin} title="Hasta" />
                                </TableCell>
                                
                                {/* CONCEPTO */}
                                <TableCell className="p-2">
                                    {row.isDraft && !row.opportunityId ? (
                                        <Select value={row.opportunityId} onValueChange={v => {
                                            handleRowChange(i, 'opportunityId', v);
                                            const title = activeOpps.find(o => o.id === v)?.title || '';
                                            handleRowChange(i, 'opportunityTitle', title);
                                        }}>
                                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccione..."/></SelectTrigger>
                                            <SelectContent>
                                                {activeOpps.map(opp => (
                                                    <SelectItem key={opp.id} value={opp.id}>{opp.title}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <span className="text-sm font-medium">{row.opportunityTitle}</span>
                                    )}
                                </TableCell>

                                {/* MONTO */}
                                <TableCell className="p-2">
                                    <Input type="number" value={row.amount} onChange={e => handleRowChange(i, 'amount', e.target.value)} className="h-8 text-xs font-mono" disabled={isAdmin} />
                                </TableCell>

                                {/* PEDIDO ADMIN */}
                                <TableCell className="p-2 flex gap-1 items-center">
                                    <Input type="date" value={row.orderDate} onChange={e => handleRowChange(i, 'orderDate', e.target.value)} className="h-8 text-xs w-[110px]" disabled={!isAdmin} title="Fecha Pedido" />
                                    <Input placeholder="Nº Pedido" value={row.orderNumber} onChange={e => handleRowChange(i, 'orderNumber', e.target.value)} className="h-8 text-xs w-[90px]" disabled={!isAdmin} />
                                </TableCell>

                                {/* FACTURA ASESOR */}
                                <TableCell className="p-2">
                                    <div className="flex gap-1 items-center">
                                        <Input type="date" value={row.date} onChange={e => handleRowChange(i, 'date', e.target.value)} className="h-8 text-xs w-[110px]" disabled={isAdmin} title="Fecha Factura" />
                                        <Input placeholder="Nº Factura" value={row.invoiceNumber} onChange={e => handleRowChange(i, 'invoiceNumber', e.target.value)} className="h-8 text-xs w-[90px]" disabled={isAdmin} />
                                    </div>
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
                                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sin registros.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            
            {!isAdmin && (
                <Button variant="outline" onClick={addManualRow}>
                    <Plus className="h-4 w-4 mr-2" /> Fila Manual
                </Button>
            )}
        </div>
    );
}
