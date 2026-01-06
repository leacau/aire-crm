'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { getPrograms } from '@/lib/firebase-service';
import type { Program, ProgramRates } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type QuoteLine = {
  id: string;
  programId: string;
  element: keyof ProgramRates;
  seconds: number;
  quantity: number; // Ahora representa "Repeticiones"
  days: number;     // Nuevo campo "Días"
};

const elementOptions: { key: keyof ProgramRates; label: string; requiresSeconds?: boolean }[] = [
  { key: 'spotRadio', label: 'Spot Radio (seg)', requiresSeconds: true },
  { key: 'spotTv', label: 'Spot TV (seg)', requiresSeconds: true },
  { key: 'pnt', label: 'PNT' },
  { key: 'pntMasBarrida', label: 'PNT + Barrida TV' },
  { key: 'auspicio', label: 'Auspicio' },
  { key: 'notaComercial', label: 'Nota Comercial' },
];

const formatCurrency = (value: number) =>
  value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const createLine = (programId?: string): QuoteLine => ({
  id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `line-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  programId: programId || '',
  element: 'spotRadio',
  seconds: 30,
  quantity: 1, // Repeticiones por defecto
  days: 1,     // Días por defecto
});

export default function QuotesPage() {
  const { userInfo } = useAuth();
  const { toast } = useToast();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [quoteTitle, setQuoteTitle] = useState('Cotización rápida');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<QuoteLine[]>([createLine()]);

  useEffect(() => {
    if (!userInfo) return;
    const loadPrograms = async () => {
      setLoadingPrograms(true);
      try {
        const fetchedPrograms = await getPrograms();
        setPrograms(fetchedPrograms);
        setLines((prev) =>
          prev.map((line, idx) => ({
            ...line,
            programId: line.programId || fetchedPrograms[0]?.id || prev[idx]?.programId || '',
          })),
        );
      } catch (error) {
        console.error('Error al cargar los programas', error);
        toast({ title: 'No se pudieron cargar las tarifas', variant: 'destructive' });
      } finally {
        setLoadingPrograms(false);
      }
    };

    loadPrograms();
  }, [toast, userInfo]);

  const resolvedLines = useMemo(() => {
    return lines.map((line) => {
      const program = programs.find((p) => p.id === line.programId) || programs[0];
      const elementMeta = elementOptions.find((opt) => opt.key === line.element) || elementOptions[0];
      const baseRate = program?.rates?.[line.element] ?? 0;
      
      const safeSeconds = elementMeta.requiresSeconds ? Math.max(line.seconds || 0, 1) : 1;
      const safeQuantity = Math.max(line.quantity || 0, 1); // Repeticiones
      const safeDays = Math.max(line.days || 0, 1);         // Días

      const unitValue = elementMeta.requiresSeconds ? baseRate * safeSeconds : baseRate;
      
      // Nuevo cálculo: Valor Unitario * Repeticiones * Días
      const total = unitValue * safeQuantity * safeDays;

      return {
        ...line,
        program,
        elementMeta,
        baseRate,
        safeSeconds,
        safeQuantity,
        safeDays,
        unitValue,
        total,
      };
    });
  }, [lines, programs]);

  const totalAmount = useMemo(
    () => resolvedLines.reduce((acc, line) => acc + (Number.isFinite(line.total) ? line.total : 0), 0),
    [resolvedLines],
  );

  const updateLine = useCallback((id: string, updates: Partial<QuoteLine>) => {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...updates } : line)));
  }, []);

  const addLine = () => {
    const defaultProgramId = lines[0]?.programId || programs[0]?.id || '';
    setLines((prev) => [...prev, createLine(defaultProgramId)]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((line) => line.id !== id)));
  };

  const resetQuote = () => {
    const defaultProgramId = programs[0]?.id || '';
    setQuoteTitle('Cotización rápida');
    setNotes('');
    setLines([createLine(defaultProgramId)]);
  };

  const copySummary = async () => {
    const summaryLines = resolvedLines.map((line, index) => {
      const programName = line.program?.name || 'Programa sin nombre';
      const elementLabel = line.elementMeta.label;
      const secondsPart = line.elementMeta.requiresSeconds ? ` · ${line.safeSeconds} seg` : '';
      
      // Actualizado para reflejar Repeticiones y Días en el resumen
      return `${index + 1}. ${programName} - ${elementLabel}${secondsPart} | ${
        line.safeQuantity
      } rep. x ${line.safeDays} días = ${formatCurrency(line.total)}`;
    });

    const summary = [
      `Título: ${quoteTitle || 'Cotización rápida'}`,
      ...(notes ? [`Notas: ${notes}`] : []),
      '',
      ...summaryLines,
      '',
      `Total estimado: ${formatCurrency(totalAmount)}`,
    ].join('\n');

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary);
        toast({ title: 'Resumen copiado al portapapeles' });
      } else {
        throw new Error('Clipboard API no disponible');
      }
    } catch (error) {
      console.error('No se pudo copiar el resumen', error);
      toast({ title: 'No se pudo copiar el resumen', variant: 'destructive' });
    }
  };

  if (!userInfo || loadingPrograms) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Cotizador">
        <Button variant="outline" onClick={resetQuote}>
          Reiniciar
        </Button>
        <Button onClick={copySummary}>Copiar resumen</Button>
      </Header>

      <main className="flex-1 space-y-4 overflow-auto p-4 md:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Datos de la propuesta</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="quote-title">
                Título
              </label>
              <Input
                id="quote-title"
                value={quoteTitle}
                onChange={(e) => setQuoteTitle(e.target.value)}
                placeholder="Ej: Campaña lanzamiento otoño"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="quote-notes">
                Notas
              </label>
              <Textarea
                id="quote-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Considerar pauta semanal o rotación en prime time."
                className="min-h-[90px]"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Ítems</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Tarifas obtenidas de la sección Tarifas</Badge>
              <Button size="sm" onClick={addLine}>
                Agregar ítem
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Programa</TableHead>
                  <TableHead className="min-w-[180px]">Elemento</TableHead>
                  <TableHead className="w-[100px] text-right">Segundos</TableHead>
                  <TableHead className="w-[110px] text-right">Repeticiones</TableHead>
                  <TableHead className="w-[100px] text-right">Días</TableHead>
                  <TableHead className="w-[140px] text-right">Tarifa base</TableHead>
                  <TableHead className="w-[150px] text-right">Valor unitario</TableHead>
                  <TableHead className="w-[150px] text-right">Total</TableHead>
                  <TableHead className="w-[100px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolvedLines.map((line) => {
                  const hasRate = Number.isFinite(line.baseRate) && line.baseRate > 0;
                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        <Select
                          value={line.programId}
                          onValueChange={(value) => updateLine(line.id, { programId: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar programa" />
                          </SelectTrigger>
                          <SelectContent>
                            {programs.map((program) => (
                              <SelectItem key={program.id} value={program.id}>
                                {program.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={line.element}
                          onValueChange={(value) =>
                            updateLine(line.id, {
                              element: value as keyof ProgramRates,
                              seconds: elementOptions.find((opt) => opt.key === value)?.requiresSeconds
                                ? line.seconds || 30
                                : 1,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Elemento" />
                          </SelectTrigger>
                          <SelectContent>
                            {elementOptions.map((option) => (
                              <SelectItem key={option.key} value={option.key}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        {line.elementMeta.requiresSeconds ? (
                          <Input
                            type="number"
                            min={1}
                            value={line.seconds}
                            onChange={(e) =>
                              updateLine(line.id, { seconds: Math.max(Number(e.target.value) || 0, 1) })
                            }
                            className="text-right"
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      
                      {/* Columna Repeticiones */}
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => updateLine(line.id, { quantity: Math.max(Number(e.target.value) || 0, 1) })}
                          className="text-right"
                        />
                      </TableCell>

                      {/* Columna Días */}
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={1}
                          value={line.days}
                          onChange={(e) => updateLine(line.id, { days: Math.max(Number(e.target.value) || 0, 1) })}
                          className="text-right"
                        />
                      </TableCell>

                      <TableCell className="text-right">
                        {hasRate ? (
                          formatCurrency(line.baseRate)
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin tarifa</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(line.unitValue)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(line.total)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => removeLine(line.id)} disabled={lines.length === 1}>
                          Quitar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {resolvedLines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                      No hay ítems. Agregá uno para empezar la cotización.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total estimado</p>
              <p className="text-3xl font-bold">{formatCurrency(totalAmount)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={resetQuote}>
                Limpiar cotización
              </Button>
              <Button onClick={copySummary}>Copiar resumen</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
