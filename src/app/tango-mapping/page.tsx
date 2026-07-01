'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { getAllUsers, getClients, updateClientTangoMapping, updateUserProfile } from '@/lib/firebase-service';
import type { Client, SellerCompanyConfig, User } from '@/lib/types';
import { RefreshCcw, CheckCircle2, Save, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { auth, db } from '@/lib/firebase';
import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';

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

type TangoCompanyKey = 'aire' | 'srl' | 'sas';

type TangoCompany = {
  key: TangoCompanyKey;
  id: '4' | '5' | '6';
  label: string;
  shortLabel: string;
  crmIdField: 'idAire' | 'idAireSrl' | 'idAireDigital';
  syncedField: 'isTangoSyncedAire' | 'isTangoSyncedSrl' | 'isTangoSyncedSas';
  sellerCompanyName: string;
  activeClass: string;
};

const TANGO_COMPANIES: TangoCompany[] = [
  {
    key: 'aire',
    id: '4',
    label: 'Aire',
    shortLabel: 'Aire',
    crmIdField: 'idAire',
    syncedField: 'isTangoSyncedAire',
    sellerCompanyName: 'Aire',
    activeClass: 'data-[state=active]:bg-red-600 data-[state=active]:text-white',
  },
  {
    key: 'srl',
    id: '5',
    label: 'AIRE SRL (TV/Radio)',
    shortLabel: 'SRL',
    crmIdField: 'idAireSrl',
    syncedField: 'isTangoSyncedSrl',
    sellerCompanyName: 'Aire SRL',
    activeClass: 'data-[state=active]:bg-blue-600 data-[state=active]:text-white',
  },
  {
    key: 'sas',
    id: '6',
    label: 'AIRE SAS (Digital)',
    shortLabel: 'SAS',
    crmIdField: 'idAireDigital',
    syncedField: 'isTangoSyncedSas',
    sellerCompanyName: 'Aire Digital SAS',
    activeClass: 'data-[state=active]:bg-orange-500 data-[state=active]:text-white',
  },
];

interface MatchResult {
  crmClient: Client;
  tangoClient: TangoClient;
  matchType: 'ID' | 'CUIT' | 'Fuzzy Denominación' | 'Fuzzy Razón Social';
  similarityScore: number;
  isSynced: boolean;
}

const cleanCuit = (cuit?: string) => (cuit || '').replace(/[^0-9]/g, '');

function stringSimilarity(s1: string, s2: string) {
  const clean1 = (s1 || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const clean2 = (s2 || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
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

const getSellerCode = (user: User, company: TangoCompany) => (
  user.sellerConfig?.find(item => item.companyName === company.sellerCompanyName)?.codes?.[0] || ''
);

const buildSellerConfig = (user: User, codes: Record<TangoCompanyKey, string>): SellerCompanyConfig[] => {
  const next = [...(user.sellerConfig || [])];
  TANGO_COMPANIES.forEach(company => {
    const trimmedCode = (codes[company.key] || '').trim();
    const existingIndex = next.findIndex(item => item.companyName === company.sellerCompanyName);

    if (!trimmedCode) {
      if (existingIndex >= 0) next.splice(existingIndex, 1);
      return;
    }

    const entry = { companyName: company.sellerCompanyName, codes: [trimmedCode] };
    if (existingIndex >= 0) next[existingIndex] = entry;
    else next.push(entry);
  });
  return next;
};

export default function TangoMappingPage() {
  const { userInfo, isBoss } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [savingSellerId, setSavingSellerId] = useState<string | null>(null);
  const [crmClients, setCrmClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sellerCodes, setSellerCodes] = useState<Record<string, Record<TangoCompanyKey, string>>>({});
  const [matchesByCompany, setMatchesByCompany] = useState<Record<TangoCompanyKey, MatchResult[]>>({
    aire: [],
    srl: [],
    sas: [],
  });
  const [tangoErrors, setTangoErrors] = useState<Partial<Record<TangoCompanyKey, string>>>({});
  const [activeCompany, setActiveCompany] = useState<TangoCompanyKey>('aire');
  const [selectedMatches, setSelectedMatches] = useState<Record<TangoCompanyKey, string[]>>({
    aire: [],
    srl: [],
    sas: [],
  });
  const [mainTab, setMainTab] = useState<'clients' | 'mapped' | 'sellers'>('clients');

  const canAccess = userInfo && (isBoss || userInfo.email === 'lchena@airedesantafe.com.ar' || userInfo.role === 'Administracion');

  const advisorUsers = useMemo(
    () => users.filter(user => !user.deletedAt && ['Asesor', 'Asesor Canjes', 'Jefe', 'Gerencia'].includes(user.role)),
    [users],
  );

  const processMatches = useCallback((crmData: Client[], tangoData: TangoClient[], company: TangoCompany) => {
    const results: MatchResult[] = [];

    crmData.forEach(crm => {
      if ((crm as any)[company.syncedField] || (crm as any)[company.crmIdField]) return;

      let matchedTango: TangoClient | null = null;
      let matchType: MatchResult['matchType'] | null = null;
      let bestScore = 0;
      const crmIdControl = String((crm as any)[company.crmIdField] || '');

      const exactIdMatch = tangoData.find(tango => tango.COD_CLIENTE === crmIdControl);
      if (exactIdMatch) {
        matchedTango = exactIdMatch;
        matchType = 'ID';
        bestScore = 100;
      } else {
        const crmCuitClean = cleanCuit(crm.cuit);
        const exactCuitMatch = tangoData.find(tango => cleanCuit(tango.NUMERO) === crmCuitClean && crmCuitClean.length > 8);
        if (exactCuitMatch) {
          matchedTango = exactCuitMatch;
          matchType = 'CUIT';
          bestScore = 100;
        } else {
          let bestFuzzyMatch: TangoClient | null = null;
          let bestFuzzyType: MatchResult['matchType'] = 'Fuzzy Denominación';

          tangoData.forEach(tango => {
            const scoreDenom = stringSimilarity(crm.denominacion, tango.RAZON_SOCIAL);
            const scoreRazon = crm.razonSocial ? stringSimilarity(crm.razonSocial, tango.RAZON_SOCIAL) : 0;
            const localBest = Math.max(scoreDenom, scoreRazon);
            if (localBest > bestScore && localBest > 10) {
              bestScore = localBest;
              bestFuzzyMatch = tango;
              bestFuzzyType = scoreDenom >= scoreRazon ? 'Fuzzy Denominación' : 'Fuzzy Razón Social';
            }
          });

          if (bestFuzzyMatch) {
            matchedTango = bestFuzzyMatch;
            matchType = bestFuzzyType;
          }
        }
      }

      if (matchedTango && matchType) {
        const isSynced = crmIdControl === matchedTango.COD_CLIENTE
          && cleanCuit(crm.cuit) === cleanCuit(matchedTango.NUMERO)
          && crm.razonSocialTango === matchedTango.RAZON_SOCIAL;

        results.push({
          crmClient: crm,
          tangoClient: matchedTango,
          matchType,
          similarityScore: bestScore,
          isSynced,
        });
      }
    });

    return results.sort((a, b) => {
      if (a.isSynced === b.isSynced) return b.similarityScore - a.similarityScore;
      return a.isSynced ? 1 : -1;
    });
  }, []);

  const fetchClientsAndMatches = useCallback(async () => {
    setLoading(true);
    try {
      const crmData = await getClients();
      setCrmClients(crmData);

      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) throw new Error('No se pudo validar la sesión.');

      const requestOptions = { headers: { Authorization: `Bearer ${idToken}` } };
      const responses = await Promise.all(
        TANGO_COMPANIES.map(async company => {
          try {
            const response = await fetch(`/api/tango/clients?company=${company.id}`, requestOptions);
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
              const message = payload?.details || payload?.error || `Tango respondio ${response.status}`;
              return [company.key, [], message] as const;
            }
            return [company.key, processMatches(crmData, payload.resultData?.list || [], company), ''] as const;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo consultar Tango';
            return [company.key, [], message] as const;
          }
        }),
      );

      setMatchesByCompany(Object.fromEntries(responses.map(([key, matches]) => [key, matches])) as Record<TangoCompanyKey, MatchResult[]>);
      setSelectedMatches({ aire: [], srl: [], sas: [] });
      setTangoErrors(Object.fromEntries(responses.filter(([, , message]) => message).map(([key, , message]) => [key, message])) as Partial<Record<TangoCompanyKey, string>>);
    } catch (error) {
      console.error('Error al traer datos:', error);
      toast({ title: 'Error de conexión con Tango', variant: 'destructive', description: 'Revisa tu conexión de red local.' });
    } finally {
      setLoading(false);
    }
  }, [processMatches, toast]);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const fetchedUsers = await getAllUsers();
      setUsers(fetchedUsers);
      const initialCodes: Record<string, Record<TangoCompanyKey, string>> = {};
      fetchedUsers.forEach(user => {
        initialCodes[user.id] = {
          aire: getSellerCode(user, TANGO_COMPANIES[0]),
          srl: getSellerCode(user, TANGO_COMPANIES[1]),
          sas: getSellerCode(user, TANGO_COMPANIES[2]),
        };
      });
      setSellerCodes(initialCodes);
    } catch (error) {
      console.error('Error al cargar vendedores:', error);
      toast({ title: 'No se pudieron cargar los asesores', variant: 'destructive' });
    } finally {
      setLoadingUsers(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!canAccess) return;
    fetchClientsAndMatches();
    fetchUsers();
  }, [canAccess, fetchClientsAndMatches, fetchUsers]);

  const buildClientUpdates = (match: MatchResult, company: TangoCompany) => {
    const updates: Record<string, any> = {
      razonSocialTango: match.tangoClient.RAZON_SOCIAL,
      cuit: match.tangoClient.NUMERO,
      rubro: match.tangoClient.ACTIVIDAD || '',
      [company.crmIdField]: match.tangoClient.COD_CLIENTE,
    };

    if (!match.crmClient.phone && match.tangoClient.TELEFONO) updates.phone = match.tangoClient.TELEFONO;
    if (!match.crmClient.localidad && match.tangoClient.LOCALIDAD) updates.localidad = match.tangoClient.LOCALIDAD;

    return updates;
  };

  const markMatchAsSynced = (match: MatchResult, company: TangoCompany, updates: Record<string, any>) => {
    setMatchesByCompany(previous => ({
      ...previous,
      [company.key]: previous[company.key].filter(item => item.crmClient.id !== match.crmClient.id),
    }));

    setCrmClients(previous => previous.map(client => (
      client.id === match.crmClient.id
        ? { ...client, ...updates, [company.syncedField]: true }
        : client
    )));

    setSelectedMatches(previous => ({
      ...previous,
      [company.key]: previous[company.key].filter(id => id !== match.crmClient.id),
    }));
  };

  const handleSync = async (match: MatchResult, company: TangoCompany) => {
    setSyncingId(`${company.key}-${match.crmClient.id}`);
    try {
      const updates = buildClientUpdates(match, company);

      await updateClientTangoMapping(match.crmClient.id, updates, userInfo!.id, userInfo!.name);
      await updateDoc(doc(db, 'clients', match.crmClient.id), { [company.syncedField]: true });

      toast({ title: 'Cliente sincronizado con éxito' });

      markMatchAsSynced(match, company, updates);
    } catch (error) {
      console.error(error);
      toast({ title: 'Error al sincronizar', variant: 'destructive' });
    } finally {
      setSyncingId(null);
    }
  };

  const handleBulkSync = async (company: TangoCompany) => {
    const selectedIds = selectedMatches[company.key];
    const matches = matchesByCompany[company.key].filter(match => selectedIds.includes(match.crmClient.id) && !match.isSynced);
    if (matches.length === 0 || !userInfo) return;
    if (!window.confirm(`Mapear ${matches.length} clientes de ${company.shortLabel}? Se procesaran uno por uno.`)) return;

    setBulkSyncing(true);
    let successCount = 0;
    let errorCount = 0;

    for (const match of matches) {
      setSyncingId(`${company.key}-${match.crmClient.id}`);
      try {
        const updates = buildClientUpdates(match, company);
        await updateClientTangoMapping(match.crmClient.id, updates, userInfo.id, userInfo.name);
        await updateDoc(doc(db, 'clients', match.crmClient.id), { [company.syncedField]: true });
        markMatchAsSynced(match, company, updates);
        successCount += 1;
      } catch (error) {
        console.error('Error bulk syncing client', match.crmClient.id, error);
        errorCount += 1;
      }
    }

    setSyncingId(null);
    setBulkSyncing(false);
    toast({
      title: 'Mapeo masivo terminado',
      description: `${successCount} vinculados${errorCount ? `, ${errorCount} con error` : ''}.`,
      variant: errorCount ? 'destructive' : 'default',
    });
  };

  const handleUndoMapping = async (client: Client, company: TangoCompany) => {
    if (!window.confirm(`Quitar el ID Tango ${company.shortLabel} de ${client.denominacion}?`)) return;
    setUndoingId(`${company.key}-${client.id}`);
    try {
      await updateDoc(doc(db, 'clients', client.id), {
        [company.crmIdField]: deleteField(),
        [company.syncedField]: deleteField(),
        updatedAt: serverTimestamp(),
      });
      setCrmClients(previous => previous.map(item => (
        item.id === client.id
          ? { ...item, [company.crmIdField]: undefined, [company.syncedField]: undefined }
          : item
      )));
      toast({ title: 'Mapeo deshecho', description: `Se quito el ID ${company.shortLabel}.` });
      fetchClientsAndMatches();
    } catch (error) {
      console.error('Error undoing Tango mapping', error);
      toast({ title: 'No se pudo deshacer el mapeo', variant: 'destructive' });
    } finally {
      setUndoingId(null);
    }
  };

  const handleSellerCodeChange = (userId: string, companyKey: TangoCompanyKey, value: string) => {
    setSellerCodes(previous => ({
      ...previous,
      [userId]: {
        ...(previous[userId] || { aire: '', srl: '', sas: '' }),
        [companyKey]: value,
      },
    }));
  };

  const handleSaveSeller = async (user: User) => {
    const codes = sellerCodes[user.id] || { aire: '', srl: '', sas: '' };
    setSavingSellerId(user.id);
    try {
      const sellerConfig = buildSellerConfig(user, codes);
      await updateUserProfile(user.id, { sellerConfig });
      setUsers(previous => previous.map(item => item.id === user.id ? { ...item, sellerConfig } : item));
      toast({ title: 'Códigos de vendedor guardados', description: user.name });
    } catch (error) {
      console.error('Error saving seller mapping', error);
      toast({ title: 'No se pudieron guardar los códigos', variant: 'destructive' });
    } finally {
      setSavingSellerId(null);
    }
  };

  if (!canAccess) {
    return <div className="p-8 text-center font-bold text-red-500">No tienes permisos para acceder a esta pantalla.</div>;
  }

  const renderClientTable = (company: TangoCompany) => {
    const matches = matchesByCompany[company.key] || [];
    const errorMessage = tangoErrors[company.key];
    const selectedIds = selectedMatches[company.key];
    const selectableMatches = matches.filter(match => !match.isSynced);
    const allSelected = selectableMatches.length > 0 && selectableMatches.every(match => selectedIds.includes(match.crmClient.id));
    const toggleAll = () => {
      setSelectedMatches(previous => ({
        ...previous,
        [company.key]: allSelected ? [] : selectableMatches.map(match => match.crmClient.id),
      }));
    };
    const toggleOne = (clientId: string) => {
      setSelectedMatches(previous => {
        const current = previous[company.key];
        return {
          ...previous,
          [company.key]: current.includes(clientId) ? current.filter(id => id !== clientId) : [...current, clientId],
        };
      });
    };
    return (
      <div className="space-y-3">
      {errorMessage && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No se pudo consultar Tango {company.shortLabel}: {errorMessage}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-white px-4 py-3 shadow-sm">
        <div className="text-sm text-slate-600">
          {selectedIds.length > 0 ? `${selectedIds.length} seleccionados para ${company.shortLabel}` : 'Selecciona filas sugeridas para mapearlas en bloque.'}
        </div>
        <Button
          size="sm"
          onClick={() => handleBulkSync(company)}
          disabled={bulkSyncing || selectedIds.length === 0}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {bulkSyncing ? <Spinner size="small" /> : 'Mapear seleccionados'}
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-slate-100">
            <TableRow>
              <TableHead className="w-[48px] text-center">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Seleccionar todos" />
              </TableHead>
              <TableHead className="w-1/2 border-r border-slate-300">Base CRM</TableHead>
              <TableHead className="w-[100px] bg-blue-50/50 text-center">Similitud</TableHead>
              <TableHead className="w-1/2 border-l border-slate-300">Datos oficiales Tango</TableHead>
              <TableHead className="w-[120px] text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  No hay clientes pendientes de validación en {company.shortLabel}.
                </TableCell>
              </TableRow>
            )}
            {matches.map((match, index) => {
              const isSyncing = syncingId === `${company.key}-${match.crmClient.id}`;
              return (
                <TableRow key={`${company.key}-${match.crmClient.id}-${index}`} className={match.isSynced ? 'bg-green-50/20' : ''}>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={selectedIds.includes(match.crmClient.id)}
                      disabled={match.isSynced || isSyncing || bulkSyncing}
                      onCheckedChange={() => toggleOne(match.crmClient.id)}
                      aria-label={`Seleccionar ${match.crmClient.denominacion}`}
                    />
                  </TableCell>
                  <TableCell className="border-r border-slate-200">
                    <div className="font-bold text-slate-800">{match.crmClient.denominacion}</div>
                    {match.crmClient.razonSocial && <div className="text-xs text-slate-500">{match.crmClient.razonSocial}</div>}
                    <div className="mt-1 flex gap-2">
                      <Badge variant="outline" className="text-[10px]">CUIT: {match.crmClient.cuit || 'S/D'}</Badge>
                      <Badge variant="outline" className="text-[10px]">ID {company.shortLabel}: {((match.crmClient as any)[company.crmIdField]) || 'S/D'}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="bg-slate-50/30 text-center">
                    {match.isSynced ? (
                      <div className="flex flex-col items-center text-green-600">
                        <CheckCircle2 className="mb-1 h-5 w-5" />
                        <span className="text-[10px] font-bold">100% OK</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <span className={`text-lg font-black ${match.similarityScore > 80 ? 'text-green-600' : match.similarityScore > 40 ? 'text-amber-500' : 'text-red-500'}`}>
                          {match.similarityScore}%
                        </span>
                        <span className="text-center text-[9px] leading-tight text-slate-500">{match.matchType}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="border-l border-slate-200">
                    <div className="font-bold text-blue-900">{match.tangoClient.RAZON_SOCIAL}</div>
                    <div className="max-w-[250px] truncate text-xs text-slate-600">{match.tangoClient.ACTIVIDAD || 'Sin rubro'}</div>
                    <div className="mt-1 flex gap-2">
                      <Badge variant="secondary" className="text-[10px]">CUIT: {match.tangoClient.NUMERO}</Badge>
                      <Badge variant="secondary" className="bg-blue-100 text-[10px]">ID: {match.tangoClient.COD_CLIENTE}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={match.isSynced ? 'secondary' : 'default'}
                      className={match.isSynced ? '' : 'bg-blue-600 hover:bg-blue-700'}
                      disabled={isSyncing || match.isSynced || bulkSyncing}
                      onClick={() => handleSync(match, company)}
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
      </div>
    );
  };

  const renderMappedTable = (company: TangoCompany) => {
    const mappedClients = crmClients
      .filter(client => Boolean((client as any)[company.crmIdField]) || Boolean((client as any)[company.syncedField]))
      .sort((a, b) => String(a.denominacion || '').localeCompare(String(b.denominacion || '')));

    return (
      <div className="overflow-hidden rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-slate-100">
            <TableRow>
              <TableHead>Cliente CRM</TableHead>
              <TableHead className="w-[160px]">ID Tango</TableHead>
              <TableHead>Razon social Tango</TableHead>
              <TableHead className="w-[130px] text-center">Marca</TableHead>
              <TableHead className="w-[140px] text-right">Accion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappedClients.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  No hay mapeos realizados en {company.shortLabel}.
                </TableCell>
              </TableRow>
            )}
            {mappedClients.map(client => {
              const isUndoing = undoingId === `${company.key}-${client.id}`;
              return (
                <TableRow key={`${company.key}-${client.id}`}>
                  <TableCell>
                    <div className="font-medium">{client.denominacion}</div>
                    <div className="text-xs text-muted-foreground">{client.cuit || 'CUIT sin cargar'}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{String((client as any)[company.crmIdField] || 'Sin ID')}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {client.razonSocialTango || client.razonSocial || 'Sin razon social registrada'}
                  </TableCell>
                  <TableCell className="text-center">
                    {Boolean((client as any)[company.syncedField]) ? (
                      <Badge className="bg-green-600">Sincronizado</Badge>
                    ) : (
                      <Badge variant="outline">ID cargado</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUndoMapping(client, company)}
                      disabled={isUndoing}
                    >
                      {isUndoing ? <Spinner size="small" /> : <Undo2 className="mr-2 h-4 w-4" />}
                      Deshacer
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderSellersTable = () => (
    <div className="overflow-hidden rounded-md border bg-white shadow-sm">
      <Table>
        <TableHeader className="bg-slate-100">
          <TableRow>
            <TableHead>Asesor CRM</TableHead>
            <TableHead className="w-[150px]">Código Aire</TableHead>
            <TableHead className="w-[150px]">Código SRL</TableHead>
            <TableHead className="w-[150px]">Código SAS</TableHead>
            <TableHead className="w-[110px] text-right">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {advisorUsers.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center">No hay asesores para mapear.</TableCell>
            </TableRow>
          )}
          {advisorUsers.map(user => {
            const codes = sellerCodes[user.id] || { aire: '', srl: '', sas: '' };
            const isSaving = savingSellerId === user.id;
            return (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.email} · {user.role}</div>
                </TableCell>
                <TableCell>
                  <Input value={codes.aire} onChange={event => handleSellerCodeChange(user.id, 'aire', event.target.value)} placeholder="ID 4" />
                </TableCell>
                <TableCell>
                  <Input value={codes.srl} onChange={event => handleSellerCodeChange(user.id, 'srl', event.target.value)} placeholder="ID 5" />
                </TableCell>
                <TableCell>
                  <Input value={codes.sas} onChange={event => handleSellerCodeChange(user.id, 'sas', event.target.value)} placeholder="ID 6" />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" onClick={() => handleSaveSeller(user)} disabled={isSaving}>
                    {isSaving ? <Spinner size="small" /> : <Save className="mr-2 h-4 w-4" />}
                    Guardar
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
    <div className="flex h-full flex-col bg-slate-50">
      <Header title="Mapeo AIRE - TANGO">
        <Button onClick={() => { fetchClientsAndMatches(); fetchUsers(); }} disabled={loading || loadingUsers} variant="outline">
          <RefreshCcw className={`mr-2 h-4 w-4 ${loading || loadingUsers ? 'animate-spin' : ''}`} />
          Recargar Datos
        </Button>
      </Header>

      <main className="mx-auto w-full max-w-7xl flex-1 overflow-auto p-4 md:p-8">
        <div className="mb-6 rounded-r-md border-l-4 border-blue-600 bg-blue-50 p-4 shadow-sm">
          <h2 className="text-lg font-bold text-blue-900">Mapeos de Tango</h2>
          <p className="mt-1 text-sm text-blue-800">
            Vincula clientes contra Tango por entidad y asigna a cada asesor sus códigos de vendedor para Aire, SRL y SAS.
          </p>
        </div>

        <Tabs value={mainTab} onValueChange={value => setMainTab(value as 'clients' | 'mapped' | 'sellers')}>
          <TabsList className="mb-6 grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="clients">Clientes</TabsTrigger>
            <TabsTrigger value="mapped">Mapeados</TabsTrigger>
            <TabsTrigger value="sellers">Vendedores</TabsTrigger>
          </TabsList>

          <TabsContent value="clients">
            {loading ? (
              <div className="flex justify-center py-20"><Spinner size="large" /></div>
            ) : (
              <Tabs value={activeCompany} onValueChange={value => setActiveCompany(value as TangoCompanyKey)}>
                <TabsList className="mb-6 grid w-full max-w-2xl grid-cols-3">
                  {TANGO_COMPANIES.map(company => (
                    <TabsTrigger key={company.key} value={company.key} className={`font-bold ${company.activeClass}`}>
                      {company.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {TANGO_COMPANIES.map(company => (
                  <TabsContent key={company.key} value={company.key}>
                    {renderClientTable(company)}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </TabsContent>

          <TabsContent value="mapped">
            {loading ? (
              <div className="flex justify-center py-20"><Spinner size="large" /></div>
            ) : (
              <Tabs value={activeCompany} onValueChange={value => setActiveCompany(value as TangoCompanyKey)}>
                <TabsList className="mb-6 grid w-full max-w-2xl grid-cols-3">
                  {TANGO_COMPANIES.map(company => (
                    <TabsTrigger key={company.key} value={company.key} className={`font-bold ${company.activeClass}`}>
                      {company.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {TANGO_COMPANIES.map(company => (
                  <TabsContent key={company.key} value={company.key}>
                    {renderMappedTable(company)}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </TabsContent>

          <TabsContent value="sellers">
            {loadingUsers ? (
              <div className="flex justify-center py-20"><Spinner size="large" /></div>
            ) : renderSellersTable()}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
