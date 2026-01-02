'use client';

import React, { useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { Client } from '@/lib/types';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type MappedData = Partial<Omit<Client, 'id' | 'personIds' | 'ownerId'>> & { ownerName?: string };
type ColumnMapping = Record<string, keyof MappedData | 'ignore'>;

interface ColumnMapperProps {
  headers: string[];
  columnMapping: ColumnMapping;
  setColumnMapping: React.Dispatch<React.SetStateAction<ColumnMapping>>;
  /**
   * Campos sugeridos como obligatorios para avanzar (validación visual).
   * Si no los usás, igual queda el warning.
   */
  requiredFields?: (keyof MappedData)[];
}

const clientFields: { value: keyof MappedData; label: string }[] = [
  { value: 'denominacion', label: 'Denominación' },
  { value: 'razonSocial', label: 'Razón Social' },
  { value: 'cuit', label: 'CUIT' },
  { value: 'condicionIVA', label: 'Condición IVA' },
  { value: 'provincia', label: 'Provincia' },
  { value: 'localidad', label: 'Localidad' },
  { value: 'tipoEntidad', label: 'Tipo Entidad' },
  { value: 'rubro', label: 'Rubro' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'observaciones', label: 'Observaciones' },
  { value: 'ownerName', label: 'Propietario' },
];

function normalizeHeader(s: string) {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[_\-]/g, ' ')
    .replace(/\s+/g, ' ');
}

function suggestFieldFromHeader(header: string): keyof MappedData | 'ignore' {
  const h = normalizeHeader(header);

  // Owner / Vendedor / Asesor
  if (/(propietario|owner|asesor|vendedor|ejecutivo|responsable)/.test(h)) return 'ownerName';

  // CUIT
  if (/(cuit|c u i t|cuil|tax id|nro cuit|nro cuil)/.test(h)) return 'cuit';

  // Razón social
  if (/(razon social|razon|rs|social)/.test(h)) return 'razonSocial';

  // Denominación / Nombre / Cliente
  if (/(denominacion|denominación|nombre fantasia|nombre cliente|cliente|empresa|comercio)/.test(h)) return 'denominacion';

  // Email
  if (/(email|e mail|correo|mail)/.test(h)) return 'email';

  // Phone
  if (/(telefono|tel|cel|celular|movil|whatsapp|wsp)/.test(h)) return 'phone';

  // Ubicación
  if (/(provincia|prov)/.test(h)) return 'provincia';
  if (/(localidad|ciudad|local|town)/.test(h)) return 'localidad';

  // IVA
  if (/(iva|condicion iva|condicion impositiva)/.test(h)) return 'condicionIVA';

  // Rubro
  if (/(rubro|actividad|categoria|categoría|segmento|industria)/.test(h)) return 'rubro';

  // Tipo entidad
  if (/(tipo entidad|tipo|entidad)/.test(h)) return 'tipoEntidad';

  // Observaciones
  if (/(observaciones|nota|notas|comentario|comentarios|obs)/.test(h)) return 'observaciones';

  return 'ignore';
}

export function ColumnMapper({
  headers,
  columnMapping,
  setColumnMapping,
  requiredFields = ['ownerName', 'denominacion', 'cuit'],
}: ColumnMapperProps) {
  // Fields already used (to prevent duplicates)
  const usedFields = useMemo(() => {
    const used = new Set<keyof MappedData>();
    Object.values(columnMapping).forEach((v) => {
      if (v && v !== 'ignore') used.add(v);
    });
    return used;
  }, [columnMapping]);

  const missingRequired = useMemo(() => {
    const mapped = new Set(Object.values(columnMapping).filter((v) => v && v !== 'ignore')) as Set<keyof MappedData>;
    return requiredFields.filter((f) => !mapped.has(f));
  }, [columnMapping, requiredFields]);

  // Auto-map on first load (only headers not already mapped)
  useEffect(() => {
    if (!headers?.length) return;

    setColumnMapping((prev) => {
      const next = { ...prev };
      const alreadyUsed = new Set<keyof MappedData>();
      Object.values(next).forEach((v) => {
        if (v && v !== 'ignore') alreadyUsed.add(v);
      });

      for (const header of headers) {
        if (next[header] && next[header] !== 'ignore') continue;

        const suggestion = suggestFieldFromHeader(header);
        if (suggestion === 'ignore') continue;

        // Avoid duplicates: if suggested already used, skip
        if (alreadyUsed.has(suggestion)) continue;

        next[header] = suggestion;
        alreadyUsed.add(suggestion);
      }

      return next;
    });
  }, [headers, setColumnMapping]);

  const handleMappingChange = (header: string, value: keyof MappedData | 'ignore') => {
    setColumnMapping((prev) => {
      const next = { ...prev };

      // If selecting a real field, ensure it is not already used by another header
      if (value !== 'ignore') {
        for (const [h, mapped] of Object.entries(next)) {
          if (h !== header && mapped === value) {
            // Unassign duplicate mapping
            next[h] = 'ignore';
          }
        }
      }

      next[header] = value;
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paso 2: Asignar Columnas</CardTitle>
        <CardDescription>
          Asigna cada columna de tu archivo a un campo del CRM. Se aplica auto-mapeo y se evita mapear dos columnas al mismo campo.
        </CardDescription>

        {missingRequired.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-sm text-yellow-800">
            <AlertTriangle className="h-4 w-4" />
            <span>
              Faltan campos recomendados: <span className="font-semibold">{missingRequired.join(', ')}</span>
            </span>
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
              Revisar
            </Badge>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        <div>
          <Label className="font-semibold text-lg">Asignar Columnas</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
            {headers.map((header) => {
              const current = columnMapping[header] || 'ignore';

              return (
                <div key={header} className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Label htmlFor={`map-${header}`} className="flex-1 font-medium truncate" title={header}>
                    {header}
                  </Label>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />

                  <Select
                    value={current}
                    onValueChange={(value: keyof MappedData | 'ignore') => handleMappingChange(header, value)}
                  >
                    <SelectTrigger id={`map-${header}`} className="w-[190px]">
                      <SelectValue placeholder="Seleccionar campo..." />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="ignore">Ignorar</SelectItem>

                      {clientFields.map((field) => {
                        const isUsedByOther = usedFields.has(field.value) && current !== field.value;
                        return (
                          <SelectItem
                            key={field.value}
                            value={field.value}
                            disabled={isUsedByOther}
                            className={cn(isUsedByOther && 'opacity-50')}
                          >
                            {field.label}
                            {isUsedByOther ? ' (en uso)' : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground mt-3">
            Tip: si elegís un campo que ya estaba asignado en otra columna, esa otra columna pasa automáticamente a “Ignorar”.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
