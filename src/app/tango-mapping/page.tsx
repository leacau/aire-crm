'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { getClients, updateClientTangoMapping } from '@/lib/firebase-service';
import { Client } from '@/lib/types';
import { RefreshCcw, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
// 🟢 IMPORTAMOS FIRESTORE PARA GUARDAR LA MARCA DEL NUEVO MAPEO
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

// Tipado de la respuesta de Tango
interface TangoClient {
    COD_CLIENTE: string;
    RAZON_SOCIAL: string;
    NUMERO: string;
    ACTIVIDAD: string | null;
    DOMICILIO: string;
    LOCALIDAD: string;
    TELEFONO: string | null;
    TELEFONO_DEL_CONTACTO: string | null;
}

// Interfaz para cruzar datos
interface MatchResult {
    crmClient: Client;
    tangoClient: TangoClient;
    matchType: 'ID' | 'CUIT' | 'Fuzzy Denominacion' | 'Fuzzy Razon Social';
    similarityScore: number;
    isSynced: boolean;
}

// Función matemática de similitud de textos
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

export default function TangoMappingPage() {
    const { userInfo, isBoss } = useAuth();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [crmClients, setCrmClients] = useState<Client[]>([]);
    const [matchesSrl, setMatchesSrl] = useState<MatchResult[]>([]);
    const [matchesDigital, setMatchesDigital] = useState<MatchResult[]>([]);
    const [activeTab, setActiveTab] = useState<'5' | '6'>('5');

    // Solo los administradores pueden ver esta pantalla
    const canAccess = userInfo && (isBoss || userInfo.email === 'lchena@airedesantafe.com.ar' || userInfo.role === 'Administracion');

    const cleanCuit = (cuit?: string) => (cuit || '').replace(/[^0-9]/g, '');

    const processMatches = (crmData: Client[], tangoData: TangoClient[], isDigital: boolean) => {
        const results: MatchResult[] = [];
        
        crmData.forEach(crm => {
            // 🟢 FILTRO DEL NUEVO MAPEO: 
            // Si ya vinculamos este cliente manualmente en esta pantalla, lo ignoramos para siempre.
            const isNewlySynced = isDigital ? (crm as any).isTangoSyncedSas : (crm as any).isTangoSyncedSrl;
            if (isNewlySynced) return;

            let matchedTango: TangoClient | null = null;
            let matchType: MatchResult['matchType'] | null = null;
            let bestScore = 0;

            const crmIdControl = isDigital ? crm.idAireDigital : crm.idAireSrl;

            // Nivel 1: Por ID exacto de Tango
            const exactIdMatch = tangoData.find(t => t.COD_CLIENTE === crmIdControl);
            if (exactIdMatch) {
                matchedTango = exactIdMatch;
                matchType = 'ID';
                bestScore = 100;
            } 
            // Nivel 2: Por CUIT exacto
            else {
                const crmCuitClean = cleanCuit(crm.cuit);
                const exactCuitMatch = tangoData.find(t => cleanCuit(t.NUMERO) === crmCuitClean && crmCuitClean.length > 8);
                if (exactCuitMatch) {
                    matchedTango = exactCuitMatch;
                    matchType = 'CUIT';
                    bestScore = 100;
                }
                // Nivel 3 y 4: Fuzzy Matching por Nombre
                else {
                    let bestFuzzyMatch: TangoClient | null = null;
                    let bestFuzzyType: MatchResult['matchType'] = 'Fuzzy Denominacion';
                    
                    tangoData.forEach(t => {
                        const scoreDenom = stringSimilarity(crm.denominacion, t.RAZON_SOCIAL);
                        const scoreRazon = crm.razonSocial ? stringSimilarity(crm.razonSocial, t.RAZON_SOCIAL) : 0;
                        
                        const localBest = Math.max(scoreDenom, scoreRazon);
                        if (localBest > bestScore && localBest > 10) { // Umbral mínimo 10%
                            bestScore = localBest;
                            bestFuzzyMatch = t;
                            bestFuzzyType = scoreDenom >= scoreRazon ? 'Fuzzy Denominacion' : 'Fuzzy Razon Social';
                        }
                    });

                    if (bestFuzzyMatch) {
                        matchedTango = bestFuzzyMatch;
                        matchType = bestFuzzyType;
                    }
                }
            }

            if (matchedTango && matchType) {
                const isSynced = crmIdControl === matchedTango.COD_CLIENTE && 
                                 cleanCuit(crm.cuit) === cleanCuit(matchedTango.NUMERO) && 
                                 crm.razonSocialTango === matchedTango.RAZON_SOCIAL;

                results.push({
                    crmClient: crm,
                    tangoClient: matchedTango,
                    matchType,
                    similarityScore: bestScore,
                    isSynced
                });
            }
        });

        // Ordenamos: Primero los no sincronizados, luego por mayor similitud
        return results.sort((a, b) => {
            if (a.isSynced === b.isSynced) return b.similarityScore - a.similarityScore;
            return a.isSynced ? 1 : -1;
        });
    };

    const fetchAllData = async () => {
        setLoading(true);
        try {
            // Traemos clientes del CRM
            const crmData = await getClients();
            setCrmClients(crmData);

            // Traemos clientes de Tango SRL (Company 5)
            const resSrl = await fetch('/api/tango/clients?company=5');
            const dataSrl = await resSrl.json();
            
            // Traemos clientes de Tango SAS (Company 6)
            const resSas = await fetch('/api/tango/clients?company=6');
            const dataSas = await resSas.json();

            if (dataSrl.resultData?.list) {
                setMatchesSrl(processMatches(crmData, dataSrl.resultData.list, false));
            }
            if (dataSas.resultData?.list) {
                setMatchesDigital(processMatches(crmData, dataSas.resultData.list, true));
            }

        } catch (error) {
            console.error("Error al traer datos:", error);
            toast({ title: 'Error de conexión con Tango', variant: 'destructive', description: 'Revisa tu conexión de red local.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (canAccess) fetchAllData();
    }, [canAccess]);

    const handleSync = async (match: MatchResult, isDigital: boolean) => {
        setSyncingId(match.crmClient.id);
        try {
            const updates: any = {
                razonSocialTango: match.tangoClient.RAZON_SOCIAL,
                cuit: match.tangoClient.NUMERO,
                rubro: match.tangoClient.ACTIVIDAD || '',
            };

            // Completamos Teléfono y Localidad SOLAMENTE si en el CRM están vacíos
            if (!match.crmClient.phone && match.tangoClient.TELEFONO) {
                updates.phone = match.tangoClient.TELEFONO;
            }
            if (!match.crmClient.localidad && match.tangoClient.LOCALIDAD) {
                updates.localidad = match.tangoClient.LOCALIDAD;
            }

            // Asignamos el ID según la empresa
            if (isDigital) {
                updates.idAireDigital = match.tangoClient.COD_CLIENTE;
            } else {
                updates.idAireSrl = match.tangoClient.COD_CLIENTE;
            }

            // Actualizamos los datos principales del cliente
            await updateClientTangoMapping(match.crmClient.id, updates, userInfo!.id, userInfo!.name);
            
            // 🟢 GUARDAMOS LA MARCA DEL NUEVO MAPEO
            // Dejamos asentado en la base de datos que este cliente ya fue validado en el nuevo sistema
            // para la empresa correspondiente (SRL o Digital), así desaparece de la lista.
            await updateDoc(doc(db, 'clients', match.crmClient.id), {
                [isDigital ? 'isTangoSyncedSas' : 'isTangoSyncedSrl']: true
            });

            toast({ title: 'Cliente sincronizado con éxito' });
            
            // Dejamos la fila en verde por UX hasta que se recargue la página, momento en el que desaparecerá
            const updateState = (prev: MatchResult[]) => {
                const list = [...prev];
                const index = list.findIndex(m => m.crmClient.id === match.crmClient.id);
                if (index > -1) {
                    list[index].isSynced = true;
                    list[index].matchType = 'ID';
                    list[index].similarityScore = 100;
                    list[index].crmClient = { ...list[index].crmClient, ...updates };
                }
                return list.sort((a, b) => {
                    if (a.isSynced === b.isSynced) return b.similarityScore - a.similarityScore;
                    return a.isSynced ? 1 : -1;
                });
            };

            if (isDigital) setMatchesDigital(updateState);
            else setMatchesSrl(updateState);

        } catch (error) {
            console.error(error);
            toast({ title: 'Error al sincronizar', variant: 'destructive' });
        } finally {
            setSyncingId(null);
        }
    };

    if (!canAccess) {
        return <div className="p-8 text-center text-red-500 font-bold">No tienes permisos para acceder a esta pantalla.</div>;
    }

    const renderTable = (matches: MatchResult[], isDigital: boolean) => (
        <div className="bg-white border rounded-md shadow-sm overflow-hidden">
            <Table>
                <TableHeader className="bg-slate-100">
                    <TableRow>
                        <TableHead className="w-1/2 border-r border-slate-300">Base de Datos CRM (Tu sistema)</TableHead>
                        <TableHead className="w-[100px] text-center bg-blue-50/50">Similitud</TableHead>
                        <TableHead className="w-1/2 border-l border-slate-300">Datos Oficiales TANGO</TableHead>
                        <TableHead className="w-[120px] text-right">Acción</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {matches.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center py-10">No hay clientes pendientes de validación en esta empresa.</TableCell></TableRow>
                    )}
                    {matches.map((match, i) => {
                        const isSyncing = syncingId === match.crmClient.id;
                        return (
                            <TableRow key={i} className={match.isSynced ? "bg-green-50/20" : ""}>
                                <TableCell className="border-r border-slate-200">
                                    <div className="font-bold text-slate-800">{match.crmClient.denominacion}</div>
                                    {match.crmClient.razonSocial && <div className="text-xs text-slate-500">{match.crmClient.razonSocial}</div>}
                                    <div className="flex gap-2 mt-1">
                                        <Badge variant="outline" className="text-[10px]">CUIT: {match.crmClient.cuit || 'S/D'}</Badge>
                                        <Badge variant="outline" className="text-[10px]">ID: {(isDigital ? match.crmClient.idAireDigital : match.crmClient.idAireSrl) || 'S/D'}</Badge>
                                    </div>
                                </TableCell>

                                <TableCell className="text-center bg-slate-50/30">
                                    {match.isSynced ? (
                                        <div className="flex flex-col items-center text-green-600">
                                            <CheckCircle2 className="w-5 h-5 mb-1" />
                                            <span className="text-[10px] font-bold">100% OK</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center">
                                            <span className={`text-lg font-black ${match.similarityScore > 80 ? 'text-green-600' : match.similarityScore > 40 ? 'text-amber-500' : 'text-red-500'}`}>
                                                {match.similarityScore}%
                                            </span>
                                            <span className="text-[9px] text-slate-500 leading-tight text-center">{match.matchType}</span>
                                        </div>
                                    )}
                                </TableCell>

                                <TableCell className="border-l border-slate-200">
                                    <div className="font-bold text-blue-900">{match.tangoClient.RAZON_SOCIAL}</div>
                                    <div className="text-xs text-slate-600 truncate max-w-[250px]">{match.tangoClient.ACTIVIDAD || 'Sin rubro'}</div>
                                    <div className="flex gap-2 mt-1">
                                        <Badge variant="secondary" className="text-[10px]">CUIT: {match.tangoClient.NUMERO}</Badge>
                                        <Badge variant="secondary" className="text-[10px] bg-blue-100">ID: {match.tangoClient.COD_CLIENTE}</Badge>
                                    </div>
                                </TableCell>

                                <TableCell className="text-right">
                                    <Button 
                                        size="sm" 
                                        variant={match.isSynced ? "secondary" : "default"}
                                        className={match.isSynced ? "" : "bg-blue-600 hover:bg-blue-700"}
                                        disabled={isSyncing || match.isSynced}
                                        onClick={() => handleSync(match, isDigital)}
                                    >
                                        {isSyncing ? <Spinner size="small" /> : match.isSynced ? 'Vinculado' : 'Vincular'}
                                    </Button>
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
            <Header title="Sincronizador AIRE - TANGO">
                <Button onClick={fetchAllData} disabled={loading} variant="outline">
                    <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Recargar Datos
                </Button>
            </Header>

            <main className="flex-1 overflow-auto p-4 md:p-8 max-w-7xl mx-auto w-full">
                <div className="mb-6 border-l-4 border-blue-600 bg-blue-50 p-4 rounded-r-md shadow-sm">
                    <h2 className="text-blue-900 font-bold text-lg">Mapeo de Clientes</h2>
                    <p className="text-sm text-blue-800 mt-1">
                        El sistema busca coincidencias entre los clientes cargados por los asesores y la base de datos oficial de Tango.<br/>
                        Al <strong>Vincular</strong>, el CRM absorberá los datos oficiales y <strong>quitará a la empresa de esta lista de pendientes</strong>.
                    </p>
                </div>

                {loading ? (
                    <div className="py-20 flex justify-center"><Spinner size="large" /></div>
                ) : (
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                        <TabsList className="mb-6 grid w-[400px] grid-cols-2">
                            <TabsTrigger value="5" className="font-bold data-[state=active]:bg-blue-600 data-[state=active]:text-white">AIRE SRL (TV/Radio)</TabsTrigger>
                            <TabsTrigger value="6" className="font-bold data-[state=active]:bg-orange-500 data-[state=active]:text-white">AIRE SAS (Digital)</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="5">
                            {renderTable(matchesSrl, false)}
                        </TabsContent>
                        <TabsContent value="6">
                            {renderTable(matchesDigital, true)}
                        </TabsContent>
                    </Tabs>
                )}
            </main>
        </div>
    );
}
