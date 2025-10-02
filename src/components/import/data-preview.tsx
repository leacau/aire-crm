'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { FileUploader } from '@/components/import/file-uploader';
import { ColumnMapper } from '@/components/import/column-mapper';
import { ValidationStep } from '@/components/import/validation-step';
import type { Client, User, ClientImportMapping } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { createClient, getUsersByRole, getClients } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ValidationResult } from '@/components/import/validation-step';
import { findBestMatch } from 'string-similarity';

type ColumnMapping = Record<string, keyof ClientImportMapping | 'ignore'>;
type ImportStep = 'upload' | 'map' | 'validate' | 'importing' | 'done';

export default function ImportPage() {
  const { userInfo, loading, isBoss } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<ImportStep>('upload');
  const [data, setData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [existingClients, setExistingClients] = useState<Client[]>([]);

  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const canAccess = userInfo?.role === 'Jefe' || userInfo?.role === 'Gerencia' || userInfo?.role === 'Administracion';

  useEffect(() => {
    if (!loading && !canAccess) {
      router.push('/');
    }
    if (canAccess) {
        Promise.all([
            getUsersByRole('Asesor'),
            getClients()
        ]).then(([fetchedAdvisors, fetchedClients]) => {
            setAdvisors(fetchedAdvisors);
            setExistingClients(fetchedClients);
        });
    }
  }, [userInfo, loading, router, canAccess]);

  const handleDataExtracted = (extractedData: any[], extractedHeaders: string[]) => {
    setData(extractedData);
    setHeaders(extractedHeaders);
    
    const initialMapping: ColumnMapping = {};
    const clientFields = ['denominacion', 'razonSocial', 'cuit', 'condicionIVA', 'provincia', 'localidad', 'tipoEntidad', 'rubro', 'email', 'phone', 'observaciones', 'ownerName'];
    extractedHeaders.forEach(header => {
        const lowerHeader = header.toLowerCase().replace(/ /g, '').replace(/\./g, '');
        const foundField = clientFields.find(field => lowerHeader.includes(field.toLowerCase()));
        initialMapping[header] = foundField as keyof ClientImportMapping || 'ignore';
    });
    setColumnMapping(initialMapping);
    setStep('map');
  };
  
  const handleValidate = () => {
    const ownerNameColumn = Object.keys(columnMapping).find(h => columnMapping[h] === 'ownerName');
    const denominacionColumn = Object.keys(columnMapping).find(h => columnMapping[h] === 'denominacion');
    const cuitColumn = Object.keys(columnMapping).find(h => columnMapping[h] === 'cuit');

    if (!denominacionColumn) {
        toast({ title: 'Campo requerido', description: 'Por favor, asigna la columna "Denominación" para continuar.', variant: 'destructive'});
        return;
    }
    if (!ownerNameColumn) {
        toast({ title: 'Propietario no asignado', description: 'Por favor, asigna la columna "Propietario".', variant: 'destructive'});
        return;
    }

    const advisorsMap = new Map(advisors.map(a => [a.name.toLowerCase(), a]));
    const existingCuits = new Set(existingClients.map(c => c.cuit).filter(Boolean));
    const existingDenominaciones = existingClients.map(c => c.denominacion);

    const results: ValidationResult[] = data.map((row, index) => {
        const result: ValidationResult = { index, data: row, issues: [], include: true };
        const ownerName = row[ownerNameColumn] ? String(row[ownerNameColumn]).toLowerCase() : '';
        const cuit = cuitColumn ? row[cuitColumn] : undefined;
        const denominacion = row[denominacionColumn];

        if (!advisorsMap.has(ownerName)) {
            result.issues.push({ type: 'error', message: `El propietario "${row[ownerNameColumn]}" no existe.` });
        }
        if (cuit && existingCuits.has(cuit)) {
            result.issues.push({ type: 'error', message: `El CUIT "${cuit}" ya existe.` });
        }
        if (denominacion) {
            const { bestMatch } = findBestMatch(denominacion, existingDenominaciones);
            if (bestMatch.rating > 0.85) {
                 result.issues.push({ type: 'warning', message: `Denominación similar a un cliente existente: "${bestMatch.target}".` });
            }
        }
        return result;
    });

    setValidationResults(results);
    setStep('validate');
  }

  const handleImport = async (rowsToImport: ValidationResult[]) => {
    const ownerNameColumn = Object.keys(columnMapping).find(h => columnMapping[h] === 'ownerName')!;
    const advisorsMap = new Map(advisors.map(a => [a.name.toLowerCase(), a]));

    setStep('importing');
    setIsImporting(true);
    setImportProgress(0);

    const clientsToCreate = rowsToImport.map(result => {
        const row = result.data;
        const client: ClientImportMapping & { rawOwnerName?: string } = {};
        for(const header in columnMapping) {
            const clientField = columnMapping[header];
            if (clientField !== 'ignore') {
                const value = row[header];
                // @ts-ignore
                client[clientField] = value === undefined ? '' : value;
            }
        }
        client.rawOwnerName = row[ownerNameColumn];
        return client;
    });

    let successCount = 0;
    for (let i = 0; i < clientsToCreate.length; i++) {
        const clientData = clientsToCreate[i];
        
        const ownerName = clientData.rawOwnerName;
        const owner = ownerName ? advisorsMap.get(String(ownerName).toLowerCase()) : undefined;

        if (clientData.denominacion && owner) {
             try {
                const { rawOwnerName, ...clientToSave } = clientData;
                await createClient(clientToSave, owner.id, owner.name);
                successCount++;
            } catch (error: any) {
                 console.error(`Error importing client ${clientData.denominacion}:`, error);
                 toast({
                    title: `Error importando ${clientData.denominacion}`,
                    description: error.message,
                    variant: 'destructive',
                    duration: 10000,
                 });
            }
        }
        setImportProgress(((i + 1) / clientsToCreate.length) * 100);
    }
    
    setIsImporting(false);
    setStep('done');
    toast({
        title: 'Importación Completa',
        description: `${successCount} de ${clientsToCreate.length} clientes fueron importados exitosamente.`
    });
  };

  const resetState = () => {
    setData([]);
    setHeaders([]);
    setColumnMapping({});
    setValidationResults([]);
    setStep('upload');
  }

  if (loading || !canAccess) {
    return (
       <div className="flex h-full w-full items-center justify-center">
          <Spinner size="large" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Importar Clientes" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 space-y-6">
        
        {step === 'upload' && (
            <FileUploader onDataExtracted={handleDataExtracted} />
        )}
        
        {step === 'map' && (
            <>
                <ColumnMapper 
                    headers={headers}
                    columnMapping={columnMapping}
                    setColumnMapping={setColumnMapping}
                />

                <div className="flex justify-between gap-4">
                     <Button variant="outline" onClick={resetState}><ArrowLeft className="mr-2 h-4 w-4" /> Cancelar</Button>
                     <Button onClick={handleValidate}>Validar Datos <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
            </>
        )}

        {step === 'validate' && (
            <ValidationStep 
                results={validationResults}
                setResults={setValidationResults}
                headers={headers}
                columnMapping={columnMapping}
                onImport={handleImport}
                onBack={() => setStep('map')}
            />
        )}
        
        {(step === 'importing' || step === 'done') && (
             <div className="flex flex-col items-center justify-center p-8 border rounded-lg">
                {step === 'importing' && <Spinner size="large" />}
                <p className="mt-4 text-lg font-medium">
                    {step === 'importing' ? 'Importando clientes...' : 'Importación finalizada'}
                </p>
                <p className="text-sm text-muted-foreground">{Math.round(importProgress)}% completado</p>
                <Progress value={importProgress} className="w-full max-w-md mt-4" />
                {step === 'done' && (
                     <Button onClick={resetState} className="mt-6">Iniciar una nueva importación</Button>
                )}
            </div>
        )}

      </main>
    </div>
  );
}