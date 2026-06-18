'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { getWorkflowAssignments, saveWorkflowAssignments, getAllUsers, syncRegisteredUsersFromAuth } from '@/lib/firebase-service';
import { User } from '@/lib/types';
import { AlertCircle, Save, ShieldAlert, Award, FileText, Landmark, Loader2, RefreshCw, Inbox, ShieldCheck, Handshake, ClipboardEdit, ClipboardCheck } from 'lucide-react';

export default function WorkflowAssignmentsPage() {
    const { userInfo, isBoss } = useAuth();
    const { toast } = useToast();

    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const [approvers, setApprovers] = useState<string[]>([]);
    const [billingReceptors, setBillingReceptors] = useState<string[]>([]);
    const [tangoInvoicers, setTangoInvoicers] = useState<string[]>([]);
    const [needLoaders, setNeedLoaders] = useState<string[]>([]);
    const [needRequestReceivers, setNeedRequestReceivers] = useState<string[]>([]);
    const [canjeRequestReceivers, setCanjeRequestReceivers] = useState<string[]>([]);
    const [canjeManagementApprovers, setCanjeManagementApprovers] = useState<string[]>([]);
    const [canjeCommercialReferents, setCanjeCommercialReferents] = useState<string[]>([]);

    const canAccess = userInfo && (isBoss || userInfo.email === 'lchena@airedesantafe.com.ar' || userInfo.role === 'Gerencia');

    const loadData = useCallback(async () => {
        if (!canAccess) return;

        setLoading(true);
        setLoadError(null);
        try {
            let [allUsers, config] = await Promise.all([getAllUsers(), getWorkflowAssignments()]);
            if (allUsers.length === 0) {
                await syncRegisteredUsersFromAuth();
                allUsers = await getAllUsers();
            }
            setUsers(allUsers);
            setApprovers(config.approvers || []);
            setBillingReceptors(config.billingReceptors || []);
            setTangoInvoicers(config.tangoInvoicers || []);
            setNeedLoaders(config.needLoaders || []);
            setNeedRequestReceivers(config.needRequestReceivers || []);
            setCanjeRequestReceivers(config.canjeRequestReceivers || []);
            setCanjeManagementApprovers(config.canjeManagementApprovers || []);
            setCanjeCommercialReferents(config.canjeCommercialReferents || []);
            if (allUsers.length === 0) {
                setLoadError('No se encontraron usuarios registrados para configurar roles.');
            }
        } catch (error) {
            console.error('Error loading workflow assignments', error);
            setLoadError('No se pudieron cargar los usuarios ni la matriz de responsabilidades.');
            toast({ title: 'Error al cargar datos', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [canAccess, toast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const togglePermission = (
        userId: string,
        type: 'approvers' | 'billingReceptors' | 'tangoInvoicers' | 'needLoaders' | 'needRequestReceivers' | 'canjeRequestReceivers' | 'canjeManagementApprovers' | 'canjeCommercialReferents'
    ) => {
        if (type === 'approvers') {
            setApprovers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
        } else if (type === 'billingReceptors') {
            setBillingReceptors(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
        } else if (type === 'tangoInvoicers') {
            setTangoInvoicers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
        } else if (type === 'needLoaders') {
            setNeedLoaders(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
        } else if (type === 'needRequestReceivers') {
            setNeedRequestReceivers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
        } else if (type === 'canjeRequestReceivers') {
            setCanjeRequestReceivers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
        } else if (type === 'canjeManagementApprovers') {
            setCanjeManagementApprovers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
        } else if (type === 'canjeCommercialReferents') {
            setCanjeCommercialReferents(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveWorkflowAssignments({
                approvers,
                billingReceptors,
                tangoInvoicers,
                needLoaders,
                needRequestReceivers,
                canjeRequestReceivers,
                canjeManagementApprovers,
                canjeCommercialReferents,
            });
            toast({ title: 'Configuración guardada', description: 'La matriz de responsabilidades ha sido actualizada con éxito.' });
        } catch {
            toast({ title: 'Error al guardar', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    if (!userInfo) return <Spinner />;
    if (!canAccess) return <div className="p-10 text-center text-red-500 font-bold text-xl">Acceso denegado. Pantalla exclusiva de la Dirección.</div>;

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <Header title="Responsabilidades del Sistema">
                <Button onClick={handleSave} disabled={saving || loading || !!loadError} className="bg-blue-600 hover:bg-blue-700 font-bold">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    {saving ? 'Guardando...' : 'Guardar Matriz'}
                </Button>
            </Header>

            <main className="flex-1 overflow-auto p-4 md:p-8 max-w-7xl mx-auto w-full">
                <div className="mb-6 bg-blue-50 border-l-4 border-blue-600 p-4 rounded shadow-sm flex items-start gap-4">
                    <ShieldAlert className="text-blue-600 w-6 h-6 shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-900 font-medium">
                        Configura qué usuarios tienen permisos de Auditoría, quiénes reciben los pedidos de los asesores y qué correos de Administración contable recibirán las solicitudes automáticas de facturas Tango.
                    </p>
                </div>

                {loading ? (
                    <div className="py-20 flex justify-center"><Spinner size="large" /></div>
                ) : loadError ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-5 text-amber-950">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                                <div>
                                    <p className="font-semibold">No se pudo completar la carga</p>
                                    <p className="text-sm">{loadError}</p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={loadData}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Reintentar
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white border rounded-md shadow-sm overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-100">
                                <TableRow>
                                    <TableHead>Usuario / Nombre</TableHead>
                                    <TableHead className="text-center min-w-[160px] bg-purple-50/30"><div className="flex justify-center items-center gap-1 font-bold text-purple-900"><Award className="w-4 h-4" /> Aprobador OP</div></TableHead>
                                    <TableHead className="text-center min-w-[170px] bg-amber-50/30"><div className="flex justify-center items-center gap-1 font-bold text-amber-900"><FileText className="w-4 h-4" /> Receptor Facturas</div></TableHead>
                                    <TableHead className="text-center min-w-[170px] bg-green-50/30"><div className="flex justify-center items-center gap-1 font-bold text-green-900"><Landmark className="w-4 h-4" /> Facturacion Tango</div></TableHead>
                                    <TableHead className="text-center min-w-[170px] bg-indigo-50/30"><div className="flex justify-center items-center gap-1 font-bold text-indigo-900"><ClipboardEdit className="w-4 h-4" /> Carga Necesidad</div></TableHead>
                                    <TableHead className="text-center min-w-[190px] bg-orange-50/30"><div className="flex justify-center items-center gap-1 font-bold text-orange-900"><ClipboardCheck className="w-4 h-4" /> Recibe Necesidad</div></TableHead>
                                    <TableHead className="text-center min-w-[170px] bg-sky-50/30"><div className="flex justify-center items-center gap-1 font-bold text-sky-900"><Inbox className="w-4 h-4" /> Gestiona Canjes</div></TableHead>
                                    <TableHead className="text-center min-w-[170px] bg-rose-50/30"><div className="flex justify-center items-center gap-1 font-bold text-rose-900"><ShieldCheck className="w-4 h-4" /> Autoriza Gerencia</div></TableHead>
                                    <TableHead className="text-center min-w-[170px] bg-cyan-50/30"><div className="flex justify-center items-center gap-1 font-bold text-cyan-900"><Handshake className="w-4 h-4" /> Referente Comercial</div></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map(u => (
                                    <TableRow key={u.id} className="hover:bg-slate-50/80">
                                        <TableCell>
                                            <div className="font-bold text-slate-800">{u.name}</div>
                                            <div className="text-xs text-slate-500 flex gap-2 mt-0.5">
                                                <span>{u.email}</span>
                                                <span>•</span>
                                                <Badge variant="outline" className="text-[9px] py-0">{u.role}</Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center bg-purple-50/10">
                                            <Switch checked={approvers.includes(u.id)} onCheckedChange={() => togglePermission(u.id, 'approvers')} />
                                        </TableCell>
                                        <TableCell className="text-center bg-amber-50/10">
                                            <Switch checked={billingReceptors.includes(u.id)} onCheckedChange={() => togglePermission(u.id, 'billingReceptors')} />
                                        </TableCell>
                                        <TableCell className="text-center bg-green-50/10">
                                            <Switch checked={tangoInvoicers.includes(u.id)} onCheckedChange={() => togglePermission(u.id, 'tangoInvoicers')} />
                                        </TableCell>
                                        <TableCell className="text-center bg-indigo-50/10">
                                            <Switch checked={needLoaders.includes(u.id)} onCheckedChange={() => togglePermission(u.id, 'needLoaders')} />
                                        </TableCell>
                                        <TableCell className="text-center bg-orange-50/10">
                                            <Switch checked={needRequestReceivers.includes(u.id)} onCheckedChange={() => togglePermission(u.id, 'needRequestReceivers')} />
                                        </TableCell>
                                        <TableCell className="text-center bg-sky-50/10">
                                            <Switch checked={canjeRequestReceivers.includes(u.id)} onCheckedChange={() => togglePermission(u.id, 'canjeRequestReceivers')} />
                                        </TableCell>
                                        <TableCell className="text-center bg-rose-50/10">
                                            <Switch checked={canjeManagementApprovers.includes(u.id)} onCheckedChange={() => togglePermission(u.id, 'canjeManagementApprovers')} />
                                        </TableCell>
                                        <TableCell className="text-center bg-cyan-50/10">
                                            <Switch checked={canjeCommercialReferents.includes(u.id)} onCheckedChange={() => togglePermission(u.id, 'canjeCommercialReferents')} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </main>
        </div>
    );
}
