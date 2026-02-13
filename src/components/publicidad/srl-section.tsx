// src/components/publicidad/srl-section.tsx

"use client";

import { useFieldArray, UseFormReturn, useWatch } from "react-hook-form";
import { format, eachMonthOfInterval, endOfMonth, eachDayOfInterval, startOfMonth, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormControl, FormField } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { srlAdTypes, AdvertisingOrderFormValues } from "@/lib/validators/advertising";

// Tipos para props
interface Program {
    id: string;
    name: string;
    // Agregamos schedules para saber los días
    schedules?: {
        daysOfWeek: number[]; // Array de números (ej: [1,2,3,4,5] para L-V)
        startTime: string;
        endTime: string;
    }[];
    rates?: {
        spotRadio?: number;
        spotTv?: number;
        pnt?: number;
        pntMasBarrida?: number;
        auspicio?: number;
        notaComercial?: number;
        [key: string]: number | undefined;
    }
}

interface SrlSectionProps {
  form: UseFormReturn<AdvertisingOrderFormValues>;
  startDate: Date;
  endDate: Date;
  programs: Program[]; 
}

export function SrlSection({ form, startDate, endDate, programs }: SrlSectionProps) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "srlItems",
  });

  const items = useWatch({
      control: form.control,
      name: "srlItems"
  });

  // LOGICA DE TARIFAS AUTOMÁTICAS
  useEffect(() => {
     items?.forEach((item, index) => {
         if (!item.programId || !item.adType) return;
         
         const program = programs.find(p => p.id === item.programId);
         if (!program || !program.rates) return;

         let rate = 0;
         const hasTv = item.hasTv;

         if (item.adType === "Spot") {
             rate = hasTv ? (program.rates.spotTv || 0) : (program.rates.spotRadio || 0);
         } else if (item.adType === "PNT") {
             rate = hasTv ? (program.rates.pntMasBarrida || 0) : (program.rates.pnt || 0);
         } else {
             const keyMap: Record<string, string> = {
                 "Auspicio": "auspicio",
                 "Nota Comercial": "notaComercial"
             };
             const rateKey = keyMap[item.adType];
             if (rateKey) rate = program.rates[rateKey] || 0;
         }

         const currentRate = form.getValues(`srlItems.${index}.unitRate`);
         if (currentRate !== rate && rate > 0) {
             form.setValue(`srlItems.${index}.unitRate`, rate);
         }
     });
  }, [items, programs, form]);


  if (!startDate || !endDate) return null;

  const months = eachMonthOfInterval({ start: startDate, end: endDate });

  // Cálculos de Totales Globales (Protegidos)
  const subtotal = items?.reduce((acc, item) => {
    const dailySpots = item.dailySpots || {};
    const totalAds = Object.values(dailySpots).reduce((sum, val) => sum + (Number(val) || 0), 0);
    const multiplier = item.adType === "Spot" ? (item.seconds || 0) : 1;
    const net = (item.unitRate || 0) * totalAds * multiplier;
    return acc + net;
  }, 0) || 0;

  const adjustment = form.watch("adjustmentSrl") || 0;
  const totalToInvoice = subtotal - adjustment;
  const agencyCommissionPct = form.watch("commissionSrl") || 0;
  const agencyAmount = form.watch("agencySale") ? (totalToInvoice * (agencyCommissionPct / 100)) : 0;
  const netAction = totalToInvoice - agencyAmount;

  return (
    <div className="space-y-12">
      
      {months.map((monthDate) => {
        const monthKey = format(monthDate, "yyyy-MM");
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        const effectiveStart = monthStart < startDate ? startDate : monthStart;
        const effectiveEnd = monthEnd > endDate ? endDate : monthEnd;
        const days = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });

        return (
          <div key={monthKey} className="border rounded-md shadow-sm overflow-hidden bg-white mb-6">
            <div className="bg-slate-200 px-4 py-2 flex justify-between items-center">
                <span className="font-bold text-slate-700">
                    {format(monthDate, "MMMM yyyy", { locale: es }).toUpperCase()}
                </span>
                <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    className="bg-white hover:bg-slate-100 text-slate-700 border-slate-300"
                    onClick={() => append({ 
                        month: monthKey,
                        programId: "", 
                        adType: "Spot", 
                        hasTv: false,
                        unitRate: 0, 
                        seconds: 0, 
                        dailySpots: {} 
                    })}
                >
                <Plus className="mr-2 h-4 w-4" /> Agregar a {format(monthDate, "MMMM", { locale: es })}
                </Button>
            </div>
            
            <div className="overflow-x-auto">
              <Table className="min-w-[1200px]">
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="w-[200px]">Programa</TableHead>
                    <TableHead className="w-[150px]">Tipo Aviso</TableHead>
                    <TableHead className="w-[50px] text-center" title="Lleva Barrida TV">TV</TableHead>
                    <TableHead className="w-[80px]"># Seg</TableHead>
                    {days.map(day => (
                      <TableHead key={day.toISOString()} className="w-[35px] p-0 text-center">
                        <div className="flex flex-col items-center justify-center h-full py-1">
                             <span className="text-[10px] font-bold text-slate-700 leading-none">{format(day, "d")}</span>
                             <span className="text-[9px] text-muted-foreground leading-none">{format(day, "EEEEE", { locale: es })}</span>
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="w-[60px] text-center font-bold text-xs">Cant.</TableHead>
                    <TableHead className="w-[60px] text-center font-bold text-xs">Segs</TableHead>
                    <TableHead className="w-[100px] text-right">Tarifa</TableHead>
                    <TableHead className="w-[110px] text-right font-bold">Neto</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => {
                    const itemValues = items?.[index];
                    if (!itemValues || itemValues.month !== monthKey) return null;

                    // --- VALIDACIÓN DE DÍAS ---
                    const currentProgram = programs.find(p => p.id === itemValues.programId);
                    // Obtenemos todos los días habilitados del programa (si tiene múltiples horarios, los combinamos)
                    // Asumimos formato 1-7 (Lun-Dom)
                    const allowedDays = new Set(
                        currentProgram?.schedules?.flatMap(s => s.daysOfWeek) || []
                    );
                    const hasScheduleRestrictions = allowedDays.size > 0;

                    const adType = itemValues.adType;
                    const enableTv = adType === "Spot" || adType === "PNT";
                    
                    const currentDailySpots = itemValues.dailySpots || {};
                    const currentSeconds = itemValues.seconds || 0;
                    const currentUnitRate = itemValues.unitRate || 0;

                    const totalAdsGlobal = Object.values(currentDailySpots).reduce((sum, val) => sum + (Number(val) || 0), 0);
                    const totalSecondsGlobal = adType === "Spot" ? (totalAdsGlobal * currentSeconds) : 0;
                    const netAmountGlobal = currentUnitRate * totalAdsGlobal * (adType === "Spot" ? currentSeconds : 1);

                    return (
                      <TableRow key={field.id}>
                        <TableCell className="p-2">
                           <FormField
                            control={form.control}
                            name={`srlItems.${index}.programId`}
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Prog." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                          />
                        </TableCell>

                        <TableCell className="p-2">
                           <FormField
                            control={form.control}
                            name={`srlItems.${index}.adType`}
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {srlAdTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                          />
                        </TableCell>
                        
                        <TableCell className="p-2 text-center">
                            <FormField
                                control={form.control}
                                name={`srlItems.${index}.hasTv`}
                                render={({ field }) => (
                                    <Checkbox 
                                        checked={field.value} 
                                        onCheckedChange={field.onChange} 
                                        disabled={!enableTv}
                                        className="h-4 w-4"
                                    />
                                )}
                            />
                        </TableCell>

                        <TableCell className="p-2">
                           {adType === "Spot" && (
                            <FormField
                                control={form.control}
                                name={`srlItems.${index}.seconds`}
                                render={({ field }) => (
                                <Input 
                                    type="number" 
                                    className="h-8 w-full text-center px-1 text-xs" 
                                    {...field} 
                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                />
                                )}
                            />
                           )}
                        </TableCell>

                        {days.map(day => {
                            const dateKey = format(day, "yyyy-MM-dd");
                            
                            // Lógica de Bloqueo de Días
                            // getDay: 0=Dom, 1=Lun ... 6=Sab
                            const jsDay = getDay(day);
                            // Convertir a formato 1-7 (1=Lun ... 7=Dom)
                            const isoDay = jsDay === 0 ? 7 : jsDay;
                            
                            // Si el programa tiene restricciones y este día no está en la lista, se bloquea
                            const isDayDisabled = hasScheduleRestrictions && !allowedDays.has(isoDay);

                            return (
                                <TableCell key={dateKey} className={cn("p-0 border-x border-slate-100", isDayDisabled && "bg-slate-100")}>
                                    <FormField
                                        control={form.control}
                                        name={`srlItems.${index}.dailySpots.${dateKey}`}
                                        render={({ field }) => (
                                            <Input 
                                                type="text"
                                                disabled={isDayDisabled}
                                                className={cn(
                                                    "h-8 w-full px-0 text-center border-none focus-visible:ring-1 focus-visible:ring-inset text-xs",
                                                    field.value ? "bg-blue-100 font-bold text-blue-800" : "text-gray-300 hover:bg-slate-50",
                                                    isDayDisabled && "cursor-not-allowed bg-transparent hover:bg-transparent placeholder:text-transparent text-transparent"
                                                )}
                                                value={field.value || ""} 
                                                onChange={e => {
                                                    const val = parseInt(e.target.value);
                                                    field.onChange(isNaN(val) ? 0 : val);
                                                }}
                                            />
                                        )}
                                    />
                                </TableCell>
                            );
                        })}

                        <TableCell className="text-center font-bold text-xs">{totalAdsGlobal}</TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">{totalSecondsGlobal > 0 ? totalSecondsGlobal : "-"}</TableCell>
                        <TableCell className="p-2">
                            <FormField
                                control={form.control}
                                name={`srlItems.${index}.unitRate`}
                                render={({ field }) => (
                                <Input 
                                    type="number" 
                                    className="h-8 text-right px-2 text-xs" 
                                    readOnly 
                                    {...field} 
                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                />
                                )}
                            />
                        </TableCell>
                        <TableCell className="text-right font-bold text-slate-700 text-xs">
                             ${netAmountGlobal.toLocaleString("es-AR")}
                        </TableCell>
                        <TableCell>
                           <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => remove(index)}>
                             <Trash2 className="h-4 w-4" />
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
      })}

      {/* FOOTER TOTALES SRL */}
      <div className="flex justify-end mt-4">
        <div className="w-full max-w-2xl bg-slate-50 p-4 rounded-lg border grid grid-cols-2 gap-x-8 gap-y-2">
            <div className="flex justify-between items-center text-sm">
                <span className="font-bold">Subtotal:</span>
                <span className="bg-red-600 text-white px-2 py-1 rounded font-mono font-bold">
                    ${subtotal.toLocaleString("es-AR")}
                </span>
            </div>
             <div className="flex justify-between items-center text-sm">
                <span className="font-bold">Desajuste:</span>
                <div className="w-32">
                     <FormField
                        control={form.control}
                        name="adjustmentSrl"
                        render={({ field }) => (
                            <Input 
                                type="number" 
                                className="h-8 text-right"
                                {...field} 
                                onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                            />
                        )}
                    />
                </div>
            </div>
             <div className="flex justify-between items-center text-sm col-span-2 border-t pt-2 mt-2">
                <span className="font-bold">Total a Facturar:</span>
                <span className="bg-yellow-400 text-black px-2 py-1 rounded font-mono font-bold text-lg">
                    ${totalToInvoice.toLocaleString("es-AR")}
                </span>
            </div>
             <div className="flex justify-between items-center text-sm text-muted-foreground">
                <span>Agencia ({agencyCommissionPct}%):</span>
                <span>${agencyAmount.toLocaleString("es-AR")}</span>
            </div>
             <div className="flex justify-between items-center text-sm">
                <span className="font-bold">Neto de Acción:</span>
                <span className="bg-green-600 text-white px-2 py-1 rounded font-mono font-bold">
                    ${netAction.toLocaleString("es-AR")}
                </span>
            </div>
        </div>
      </div>
    </div>
  );
}
