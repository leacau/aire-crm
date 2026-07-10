'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getClients, mergeClients } from '@/lib/api/clients';
import { Client } from '@/lib/types';
import { ArrowRight, AlertTriangle, ShieldAlert, ArrowLeftRight, Wand2, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge'; // 🟢 ACÁ ESTÁ LA IMPORTACIÓN QUE FALTABA

// 🟢 FUNCIÓN MATEMÁTICA DE SIMILITUD DE TEXTOS (FUZZY MATCHING)
function stringSimilarity(s1: string, s2: string) {
    const clean1 = (s1 || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const clean2 = (s2 || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean1 === clean2) return 100;
    if (clean1.length === 0 || clean2.length === 0) return 0;

    let matches = 0;
    for (let i = 0; i < clean1.length - 1; i++) {
        const bigram = clean1.substring(i, i + 2);
        if (clean2.includes(bigram)) matches++;
    }
    const score = (2.0 * matches) / (clean1.length + clean2.length - 2);
    return Math.round(score * 100);
}

interface DuplicateGroup {
    id: string;
    reason: string;
    clients: Client[];
}

export default function DataCleanupPage() {
    const { userInfo, isBoss } = useAuth();
    const { toast } = useToast();

    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [merging, setMerging] = useState(false);

    // Búsqueda Manual
    const [searchTarget, setSearchTarget] = useState('');
    const [searchSource, setSearchSource] = useState('');

    // Selección actual
    const [targetClient, setTargetClient] = useState<Client | null>(null);
    const [sourceClient, setSourceClient] = useState<Client | null>(null);

    // Sugerencias Inteligentes
    const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);

    // Seguridad: Solo Jefes y Gerencia
    const canAccess = userInfo && (isBoss || userInfo.role === 'Gerencia' || userInfo.role === 'Jefe');

    useEffect(() => {
        if (canAccess) {
            loadData();
        }
    }, [canAccess]);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getClients();
            setClients(data);
            runDuplicateDetection(data);
        } catch (e) {
            toast({ title: 'Error al cargar datos', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    // 🟢 MOTOR DE DETECCIÓN AUTOMÁTICA DE DUPLICADOS
    const runDuplicateDetection = (allClients: Client[]) => {
        const groups: DuplicateGroup[] = [];
        const processedPairs = new Set<string>();

        const addGroup = (reason: string, groupClients: Client[]) => {
            if (groupClients.length < 2) return;
            const key = groupClients.map(c => c.id).sort().join('-');
            if (processedPairs.has(key)) return;
            processedPairs.add(key);
            groups.push({ id: key, reason, clients: groupClients });
        };

        // 1. Detección por CUIT
        const byCuit: Record<string, Client[]> = {};
        allClients.forEach(c => {
            if (c.cuit && c.cuit.trim().length > 6) {
                const cleanCuit = c.cuit.replace(/[^0-9]/g, '');
                if (!byCuit[cleanCuit]) byCuit[cleanCuit] = [];
                byCuit[cleanCuit].push(c);
            }
        });
        Object.entries(byCuit).forEach(([cuit, arr]) => {
            if (arr.length > 1) addGroup(`Mismo CUIT (${cuit})`, arr);
        });

        // 2. Detección por ID SRL
        const bySrl: Record<string, Client[]> = {};
        allClients.forEach(c => {
            if (c.idAireSrl && c.idAireSrl.toString().trim() !== '') {
                const id = c.idAireSrl.toString().trim();
                if (!bySrl[id]) bySrl[id] = [];
                bySrl[id].push(c);
            }
        });
        Object.entries(bySrl).forEach(([id, arr]) => {
            if (arr.length > 1) addGroup(`Mismo ID SRL (${id})`, arr);
        });

        // 3. Detección por ID SAS
        const bySas: Record<string, Client[]> = {};
        allClients.forEach(c => {
            if (c.idAireDigital && c.idAireDigital.toString().trim() !== '') {
                const id = c.idAireDigital.toString().trim();
                if (!bySas[id]) bySas[id] = [];
                bySas[id].push(c);
            }
        });
        Object.entries(bySas).forEach(([id, arr]) => {
            if (arr.length > 1) addGroup(`Mismo ID Digital (${id})`, arr);
        });

        // 4. Detección por Similitud de Texto (>85%)
        for (let i = 0; i < allClients.length; i++) {
            const similars: Client[] = [allClients[i]];
            for (let j = i + 1; j < allClients.length; j++) {
                const score = stringSimilarity(allClients[i].denominacion, allClients[j].denominacion);
                if (score > 85) {
                    similars.push(allClients[j]);
                }
            }
            if (similars.length > 1) {
                addGroup(`Nombres muy similares (${allClients[i].denominacion})`, similars);
            }
        }

        setDuplicateGroups(groups);
    };

    // Filtros para la búsqueda manual
    const filteredTargets = useMemo(() => {
        if (!searchTarget || searchTarget.length < 2) return [];
        return clients.filter(c => c.denominacion.toLowerCase().includes(searchTarget.toLowerCase()) && c.id !== sourceClient?.id).slice(0, 10);
    }, [searchTarget, clients, sourceClient]);

    const filteredSources = useMemo(() => {
        if (!searchSource || searchSource.length < 2) return [];
        return clients.filter(c => c.denominacion.toLowerCase().includes(searchSource.toLowerCase()) && c.id !== targetClient?.id).slice(0, 10);
    }, [searchSource, clients, targetClient]);

    const loadSuggestion = (group: DuplicateGroup) => {
        setTargetClient(group.clients[0]);
        setSourceClient(group.clients[1]); // Carga los primeros dos de la sugerencia
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    };

    const swapClients = () => {
        const temp = targetClient;
        setTargetClient(sourceClient);
        setSourceClient(temp);
    };

    const handleMerge = async () => {
        if (!targetClient || !sourceClient) return;
        
        const confirm1 = window.confirm(`ATENCIÓN: Vas a eliminar a "${sourceClient.denominacion}" y pasar todos sus datos a "${targetClient.denominacion}".`);
        if (!confirm1) return;
        
        const confirm2 = window.confirm(`¿Estás 100% seguro? Esta acción NO SE PUEDE DESHACER.`);
        if (!confirm2) return;

        setMerging(true);
        try {
            await mergeClients(targetClient.id, sourceClient.id);
            toast({ title: '¡Fusión Exitosa!', description: 'Todos los datos fueron migrados y el duplicado fue eliminado.' });
            
            setTargetClient(null);
            setSourceClient(null);
            setSearchTarget('');
            setSearchSource('');
            loadData(); // Recargamos y re-escaneamos
        } catch (error: any) {
            toast({ title: 'Error al fusionar', description: error.message, variant: 'destructive' });
        } finally {
            setMerging(false);
        }
    };

    if (!userInfo) return <Spinner />;
    if (!canAccess) return <div className="p-10 text-center text-red-500 font-bold text-xl">Acceso Denegado. Pantalla exclusiva de Gerencia.</div>;

    return (
        <div className="flex flex-col h-full bg-slate-50 relative pb-20">
            <Header title="Limpieza de Base de Datos (Fusión)" />

            <main className="flex-1 overflow-auto p-4 md:p-8 max-w-7xl mx-auto w-full">
                <div className="mb-6 bg-red-50 border-l-4 border-red-600 p-4 rounded shadow-sm flex items-start gap-4">
                    <ShieldAlert className="text-red-600 w-8 h-8 shrink-0 mt-1" />
                    <div>
                        <h2 className="text-red-900 font-bold text-lg">Zona de Peligro - Fusión de Duplicados</h2>
                        <p className="text-sm text-red-800 mt-1">
                            Esta herramienta transfiere absolutamente todo (Oportunidades, Facturas, Notas, Redes, Actividades) del <strong>Cliente Duplicado</strong> hacia el <strong>Cliente Principal</strong> y luego <strong>elimina al duplicado para siempre</strong>. Úselo con extrema precaución.
                        </p>
                    </div>
                </div>

                {loading ? <Spinner className="mx-auto mt-20" size="large" /> : (
                    <>
                        <Tabs defaultValue="auto" className="w-full mb-8">
                            <TabsList className="mb-4">
                                <TabsTrigger value="auto" className="font-bold"><Wand2 className="w-4 h-4 mr-2"/> Sugerencias Inteligentes ({duplicateGroups.length})</TabsTrigger>
                                <TabsTrigger value="manual" className="font-bold"><Search className="w-4 h-4 mr-2"/> Búsqueda Manual</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="auto">
                                <div className="bg-white p-6 rounded-md border shadow-sm">
                                    <h3 className="font-bold text-lg text-slate-800 mb-2">El sistema detectó {duplicateGroups.length} posibles duplicados</h3>
                                    <p className="text-sm text-slate-500 mb-6">Revisa las sugerencias y haz clic en "Resolver" para llevarlos al panel de fusión.</p>
                                    
                                    {duplicateGroups.length === 0 && (
                                        <div className="text-center p-8 bg-green-50 text-green-700 font-bold rounded border border-green-200">
                                            ¡Excelente! Tu base de datos parece estar libre de duplicados evidentes.
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {duplicateGroups.map(group => (
                                            <div key={group.id} className="border border-slate-200 rounded-md p-4 bg-slate-50 hover:border-blue-400 transition-colors">
                                                <Badge variant="secondary" className="mb-3 bg-blue-100 text-blue-800 border-blue-200">{group.reason}</Badge>
                                                <ul className="text-sm space-y-2 mb-4">
                                                    {group.clients.map((c, i) => (
                                                        <li key={i} className="flex flex-col border-l-2 border-slate-300 pl-2">
                                                            <span className="font-bold text-slate-700 truncate" title={c.denominacion}>{c.denominacion}</span>
                                                            <span className="text-xs text-slate-500 truncate">{c.ownerName || 'Sin dueño'}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                                <Button size="sm" variant="outline" className="w-full bg-white font-bold" onClick={() => loadSuggestion(group)}>
                                                    Resolver Fusión
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </TabsContent>
                            
                            <TabsContent value="manual">
                                <div className="bg-white p-6 rounded-md border shadow-sm">
                                    <h3 className="font-bold text-lg text-slate-800 mb-2">Búsqueda Manual</h3>
                                    <p className="text-sm text-slate-500">Utiliza los paneles de abajo para buscar manualmente los clientes que deseas fusionar.</p>
                                </div>
                            </TabsContent>
                        </Tabs>

                        {/* PANEL DE FUSIÓN (DOBLE LADO) */}
                        <div className="grid md:grid-cols-[1fr_auto_1fr] gap-6 items-stretch mt-10 bg-white p-6 rounded-lg border shadow-sm">
                            
                            {/* PANEL IZQUIERDO: CLIENTE PRINCIPAL (EL QUE QUEDA) */}
                            <div className="border-2 border-green-200 rounded-lg p-6 relative bg-green-50/30">
                                <div className="absolute top-0 left-0 bg-green-500 text-white px-3 py-1 text-xs font-bold rounded-br-lg rounded-tl-md">
                                    CLIENTE PRINCIPAL (SOBREVIVE)
                                </div>
                                <h3 className="font-bold text-lg mt-4 mb-4 text-slate-700">1. Buscar cliente a conservar:</h3>
                                <Input 
                                    placeholder="Escribe para buscar..." 
                                    value={searchTarget} 
                                    onChange={e => setSearchTarget(e.target.value)} 
                                    className="mb-2 bg-white"
                                />
                                {searchTarget.length >= 2 && !targetClient && (
                                    <div className="border rounded bg-white flex flex-col gap-1 p-1 max-h-40 overflow-y-auto absolute z-10 w-full left-0 mt-1 shadow-lg">
                                        {filteredTargets.map(c => (
                                            <button key={c.id} className="text-left px-3 py-2 text-sm hover:bg-green-100 rounded" onClick={() => {setTargetClient(c); setSearchTarget('');}}>
                                                <span className="font-bold">{c.denominacion}</span> <span className="text-slate-500 text-xs">({c.cuit || 'Sin CUIT'})</span>
                                            </button>
                                        ))}
                                        {filteredTargets.length === 0 && <span className="text-xs text-slate-400 p-2">Sin resultados...</span>}
                                    </div>
                                )}

                                {targetClient && (
                                    <div className="mt-4 p-4 bg-white border border-green-300 rounded text-sm relative shadow-sm">
                                        <button onClick={() => {setTargetClient(null); setSearchTarget('');}} className="absolute top-2 right-2 text-xs text-red-500 hover:underline font-bold">Quitar</button>
                                        <p className="font-black text-green-900 text-xl mb-2 pr-10">{targetClient.denominacion}</p>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <p><strong>Razón Social:</strong> <br/>{targetClient.razonSocial || '-'}</p>
                                            <p><strong>CUIT:</strong> <br/>{targetClient.cuit || '-'}</p>
                                            <p><strong>ID SRL:</strong> <br/>{targetClient.idAireSrl || '-'}</p>
                                            <p><strong>ID SAS:</strong> <br/>{targetClient.idAireDigital || '-'}</p>
                                            <p className="col-span-2"><strong>Asesor / Dueño:</strong> <br/>{targetClient.ownerName || 'Sin dueño'}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* BOTÓN DE INTERCAMBIO (SWAP) */}
                            <div className="flex flex-col items-center justify-center pt-6 pb-6 md:pt-10">
                                <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="rounded-full w-12 h-12 border-slate-300 hover:bg-blue-50 hover:text-blue-600 shadow-sm"
                                    onClick={swapClients}
                                    title="Intercambiar posiciones"
                                    disabled={!targetClient && !sourceClient}
                                >
                                    <ArrowLeftRight className="w-6 h-6" />
                                </Button>
                            </div>

                            {/* PANEL DERECHO: CLIENTE DUPLICADO (EL QUE SE BORRA) */}
                            <div className="border-2 border-red-200 rounded-lg p-6 relative bg-red-50/30">
                                <div className="absolute top-0 right-0 bg-red-500 text-white px-3 py-1 text-xs font-bold rounded-bl-lg rounded-tr-md">
                                    CLIENTE DUPLICADO (SE ELIMINA)
                                </div>
                                <h3 className="font-bold text-lg mt-4 mb-4 text-slate-700">2. Buscar cliente a eliminar:</h3>
                                <Input 
                                    placeholder="Escribe para buscar..." 
                                    value={searchSource} 
                                    onChange={e => setSearchSource(e.target.value)} 
                                    className="mb-2 bg-white"
                                />
                                {searchSource.length >= 2 && !sourceClient && (
                                    <div className="border rounded bg-white flex flex-col gap-1 p-1 max-h-40 overflow-y-auto absolute z-10 w-full left-0 mt-1 shadow-lg">
                                        {filteredSources.map(c => (
                                            <button key={c.id} className="text-left px-3 py-2 text-sm hover:bg-red-100 rounded" onClick={() => {setSourceClient(c); setSearchSource('');}}>
                                                <span className="font-bold">{c.denominacion}</span> <span className="text-slate-500 text-xs">({c.cuit || 'Sin CUIT'})</span>
                                            </button>
                                        ))}
                                        {filteredSources.length === 0 && <span className="text-xs text-slate-400 p-2">Sin resultados...</span>}
                                    </div>
                                )}

                                {sourceClient && (
                                    <div className="mt-4 p-4 bg-white border border-red-300 rounded text-sm relative shadow-sm">
                                        <button onClick={() => {setSourceClient(null); setSearchSource('');}} className="absolute top-2 right-2 text-xs text-red-500 hover:underline font-bold">Quitar</button>
                                        <p className="font-black text-red-900 text-xl mb-2 pr-10">{sourceClient.denominacion}</p>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <p><strong>Razón Social:</strong> <br/>{sourceClient.razonSocial || '-'}</p>
                                            <p><strong>CUIT:</strong> <br/>{sourceClient.cuit || '-'}</p>
                                            <p><strong>ID SRL:</strong> <br/>{sourceClient.idAireSrl || '-'}</p>
                                            <p><strong>ID SAS:</strong> <br/>{sourceClient.idAireDigital || '-'}</p>
                                            <p className="col-span-2"><strong>Asesor / Dueño:</strong> <br/>{sourceClient.ownerName || 'Sin dueño'}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* BOTÓN DE EJECUCIÓN */}
                        <div className="mt-8 flex justify-center">
                            <Button 
                                size="lg" 
                                className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-12 py-6 text-lg shadow-xl"
                                disabled={!targetClient || !sourceClient || merging}
                                onClick={handleMerge}
                            >
                                {merging ? <Spinner className="mr-2" /> : <AlertTriangle className="mr-2 w-6 h-6 text-yellow-400" />}
                                {merging ? 'MIGRANDO DATOS...' : 'EJECUTAR FUSIÓN DE CLIENTES'}
                            </Button>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
