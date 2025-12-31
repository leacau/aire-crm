

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, PlusCircle, Download } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { GrillaSemanal } from '@/components/grilla/grilla-semanal';
import { GrillaDiaria } from '@/components/grilla/grilla-diaria';
import { ProgramFormDialog } from '@/components/grilla/program-form-dialog';
import type { Program, CommercialItem } from '@/lib/types';
import { getPrograms, saveProgram, updateProgram, deleteProgram, saveCommercialItemSeries, updateCommercialItem, deleteCommercialItem, getCommercialItemsBySeries } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { CommercialItemFormDialog } from '@/components/grilla/commercial-item-form-dialog';
import { DeleteItemDialog } from '@/components/grilla/delete-item-dialog';
import { addDays, format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { GrillaPdf } from '@/components/grilla/grilla-pdf';
import { hasPermission } from '@/lib/permissions';

const parseDateString = (dateString: string) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
};

export default function GrillaPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const pdfRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<'semanal' | 'diaria'>('semanal');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  const [isProgramFormOpen, setIsProgramFormOpen] = useState(false);
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [isDeleteItemDialogOpen, setIsDeleteItemDialogOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [programToDelete, setProgramToDelete] = useState<Program | null>(null);
  const [selectedItem, setSelectedItem] = useState<CommercialItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<CommercialItem | null>(null);
  const [preselectedDataForItem, setPreselectedDataForItem] = useState<{ programId?: string, date?: Date, dates?: Date[] } | null>(null);

  // PDF Export State
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [pdfOptions, setPdfOptions] = useState({ dateType: 'generic', includeItems: true });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const canManage = userInfo ? hasPermission(userInfo, 'Grilla', 'edit') : false;


  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    try {
        const fetchedPrograms = await getPrograms();
        setPrograms(fetchedPrograms);
    } catch (error) {
        console.error("Error fetching programs:", error);
        toast({ title: "Error al cargar los programas", variant: "destructive" });
    } finally {
        setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);


  const handleDayClick = (day: Date) => {
    setCurrentDate(day);
    setView('diaria');
  };
  
  const handleItemClick = async (item: CommercialItem) => {
    setIsItemFormOpen(false); // Ensure form is closed before loading
    setLoading(true);
    setSelectedItem(item);

    let dates: Date[] = [];
    if (item.seriesId) {
        try {
            const seriesItems = await getCommercialItemsBySeries(item.seriesId);
            dates = seriesItems.map(i => parseDateString(i.date));
        } catch (e) {
            console.error("Failed to fetch series items", e);
            dates = [parseDateString(item.date)]; // Fallback
        }
    } else {
        dates = [parseDateString(item.date)];
    }
    
    setPreselectedDataForItem({ dates });
    setLoading(false);
    setIsItemFormOpen(true);
  };
  
  const handleOpenItemForm = (programId: string, date: Date) => {
    setSelectedItem(null);
    setPreselectedDataForItem({ programId, date, dates: [date] });
    setIsItemFormOpen(true);
  }


  const handleBackToWeek = () => {
    setView('semanal');
    setSelectedItem(null); // Clear selection when going back
  };

  const openProgramForm = (program: Program | null = null) => {
    setSelectedProgram(program);
    setIsProgramFormOpen(true);
  };

  const handleSaveProgram = async (programData: Omit<Program, 'id'>) => {
    if (!userInfo) return;
    try {
        if (selectedProgram) { // Editing
            await updateProgram(selectedProgram.id, programData, userInfo.id);
            toast({ title: "Programa Actualizado" });
        } else { // Creating
            await saveProgram(programData, userInfo.id);
            toast({ title: "Programa Creado" });
        }
        fetchPrograms();
    } catch (error) {
        console.error("Error saving program:", error);
        toast({ title: "Error al guardar el programa", variant: "destructive" });
    }
  };

  const handleDeleteProgram = async () => {
    if (!programToDelete || !userInfo) return;
    try {
        await deleteProgram(programToDelete.id, userInfo.id);
        toast({ title: "Programa Eliminado" });
        fetchPrograms();
    } catch (error) {
        console.error("Error deleting program:", error);
        toast({ title: "Error al eliminar el programa", variant: "destructive" });
    } finally {
        setProgramToDelete(null);
    }
  };
  
  const handleSaveCommercialItem = async (item: Omit<CommercialItem, 'id' | 'date'>, dates: Date[]) => {
      if (!userInfo) return;
      try {
        if (selectedItem) { // Editing existing item
             if (selectedItem.seriesId) {
                // If it's part of a series, update the whole series
                await saveCommercialItemSeries({ ...item, seriesId: selectedItem.seriesId }, dates, userInfo.id, true);
            } else if (dates.length > 1) {
                // If it wasn't a series but now is, create a new series
                const newSeriesId = await saveCommercialItemSeries(item, dates, userInfo.id);
                // Assign the new seriesId to the original item being edited
                await updateCommercialItem(selectedItem.id, { seriesId: newSeriesId }, userInfo.id, userInfo.name);
            } else {
                // Single item update
                await updateCommercialItem(selectedItem.id, item, userInfo.id, userInfo.name);
            }
            toast({ title: 'Elemento comercial actualizado' });
        } else { // Creating new items
            await saveCommercialItemSeries(item, dates, userInfo.id);
            toast({ title: 'Elemento(s) comercial(es) guardado(s)', description: `${dates.length} elemento(s) han sido creados.` });
        }
        // Instead of fetching all programs, we can just invalidate the specific days' data if we had a cache.
        // For simplicity, we refetch. A more complex app could optimize this.
        setView('semanal');
        setTimeout(() => setView('diaria'), 50); // Force re-render of daily view
      } catch (error) {
          console.error("Error saving commercial item(s):", error);
          toast({ title: 'Error al guardar el elemento', variant: 'destructive' });
      }
  };

  const handleDeleteItem = async (item: CommercialItem, deleteMode: 'single' | 'forward' | 'all') => {
    if (!canManage) return;

    try {
        let idsToDelete: string[] = [];
        if (deleteMode === 'single' || !item.seriesId) {
            idsToDelete.push(item.id);
        } else {
            const seriesItems = await getCommercialItemsBySeries(item.seriesId);
            if (deleteMode === 'all') {
                idsToDelete = seriesItems.map(i => i.id);
            } else { // 'forward'
                idsToDelete = seriesItems
                    .filter(i => parseDateString(i.date) >= parseDateString(item.date))
                    .map(i => i.id);
            }
        }
        
        if (idsToDelete.length > 0) {
            await deleteCommercialItem(idsToDelete);
            toast({ title: `Se eliminaron ${idsToDelete.length} elemento(s)` });
        }
        
        setIsDeleteItemDialogOpen(false);
        setItemToDelete(null);
        // Force a re-render of the daily view to reflect changes
        setView('semanal');
        setTimeout(() => setView('diaria'), 50);
      } catch (error) {
          console.error("Error deleting commercial item(s):", error);
          toast({ title: 'Error al eliminar el elemento', variant: 'destructive' });
      }
  };
  
  const openDeleteItemDialog = (item: CommercialItem) => {
    setItemToDelete(item);
    setIsDeleteItemDialogOpen(true);
  };


  if (authLoading || loading) {
    return (
      <div class="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  const navigateWeek = (direction: 'next' | 'prev') => {
    const amount = direction === 'next' ? 7 : -7;
    setCurrentDate(prev => addDays(prev, amount));
  };
  
  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    const element = pdfRef.current;
    if (!element) {
      setIsGeneratingPdf(false);
      return;
    }

    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: 'a4'
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = imgWidth / imgHeight;

      let widthInPdf, heightInPdf;
      if (pdfWidth / ratio <= pdfHeight) {
          widthInPdf = pdfWidth;
          heightInPdf = pdfWidth / ratio;
      } else {
          heightInPdf = pdfHeight;
          widthInPdf = pdfHeight * ratio;
      }
      
      pdf.addImage(imgData, 'PNG', 0, 0, widthInPdf, heightInPdf);
      pdf.save(`grilla-comercial-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
      console.error("Error generating PDF", error);
      toast({ title: "Error al generar el PDF", variant: "destructive" });
    } finally {
      setIsGeneratingPdf(false);
      setIsPdfDialogOpen(false);
    }
  };


  return (
    <>
      <div style={{ position: 'fixed', left: '-200vw', top: 0, zIndex: -1 }}>
        <GrillaPdf
            ref={pdfRef}
            programs={programs}
            currentDate={currentDate}
            options={pdfOptions}
        />
      </div>
      <div class="flex flex-col h-full">
        <Header title="Grilla Comercial">
            <div class="flex items-center gap-2 flex-wrap justify-end">
              {view === 'diaria' ? (
                  <Button variant="outline" onClick={handleBackToWeek} class="flex items-center gap-2">
                      <ArrowLeft class="h-4 w-4" />
                      Semana
                  </Button>
              ) : (
                  <div class="flex items-center gap-2 md:gap-4">
                      <div class="flex items-center gap-1">
                          <Button variant="outline" size="icon" onClick={() => navigateWeek('prev')}><ArrowLeft class="h-4 w-4" /></Button>
                          <Button variant="outline" size="icon" onClick={() => navigateWeek('next')}><ArrowRight class="h-4 w-4" /></Button>
                      </div>
                      <h3 class="text-base sm:text-lg font-semibold capitalize min-w-[120px] text-center">
                          {format(currentDate, 'MMMM yyyy', { locale: es })}
                      </h3>
                  </div>
              )}
              
              {canManage && (
                  <div class="flex items-center gap-2">
                      <Button onClick={() => openProgramForm()} size="sm">
                          <PlusCircle class="mr-2 h-4 w-4"/>
                          Programa
                      </Button>
                      <Button variant="secondary" onClick={() => { setSelectedItem(null); setPreselectedDataForItem(null); setIsItemFormOpen(true);}} size="sm">
                          <PlusCircle class="mr-2 h-4 w-4"/>
                          Elemento
                      </Button>
                  </div>
              )}
              <Button onClick={() => setIsPdfDialogOpen(true)} size="sm" variant="outline">
                <Download class="mr-2 h-4 w-4" />
                Exportar PDF
              </Button>
            </div>
        </Header>
        <main class="flex-1 overflow-auto p-2 sm:p-4 md:p-6">
          {view === 'semanal' ? (
            <GrillaSemanal 
                programs={programs} 
                onDayClick={handleDayClick} 
                onEditProgram={openProgramForm}
                onDeleteProgram={(p) => setProgramToDelete(p)}
                canManage={!!canManage}
                currentDate={currentDate}
            />
          ) : (
            <GrillaDiaria 
                date={currentDate} 
                programs={programs}
                canManage={!!canManage}
                onItemClick={handleItemClick}
                onAddItemClick={handleOpenItemForm}
                key={currentDate.toISOString() + programs.length} // Force re-render on data change
            />
          )}
        </main>
      </div>
       <ProgramFormDialog
        isOpen={isProgramFormOpen}
        onOpenChange={setIsProgramFormOpen}
        onSave={handleSaveProgram}
        program={selectedProgram}
      />
      <CommercialItemFormDialog
          isOpen={isItemFormOpen}
          onOpenChange={setIsItemFormOpen}
          onSave={handleSaveCommercialItem}
          onDelete={openDeleteItemDialog}
          item={selectedItem}
          programs={programs}
          preselectedData={preselectedDataForItem}
      />
       <AlertDialog open={!!programToDelete} onOpenChange={(open) => !open && setProgramToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar Programa?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción es irreversible y eliminará permanentemente el programa "{programToDelete?.name}".
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteProgram} variant="destructive">
                    Eliminar
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {itemToDelete && canManage && (
          <DeleteItemDialog
            isOpen={isDeleteItemDialogOpen}
            onOpenChange={setIsDeleteItemDialogOpen}
            item={itemToDelete}
            onConfirmDelete={handleDeleteItem}
        />
      )}
       <Dialog open={isPdfDialogOpen} onOpenChange={setIsPdfDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Exportar Grilla a PDF</DialogTitle>
                <DialogDescription>
                    Elige las opciones para tu exportación.
                </DialogDescription>
            </DialogHeader>
            <div class="space-y-6 py-4">
                <div class="space-y-3">
                    <Label class="font-semibold">Tipo de Fecha</Label>
                    <RadioGroup 
                        defaultValue="generic" 
                        value={pdfOptions.dateType}
                        onValueChange={(value) => setPdfOptions(prev => ({...prev, dateType: value}))}
                    >
                        <div class="flex items-center space-x-2">
                            <RadioGroupItem value="generic" id="date-generic" />
                            <Label htmlFor="date-generic" class="font-normal">Semana Genérica (Lunes a Domingo)</Label>
                        </div>
                         <div class="flex items-center space-x-2">
                            <RadioGroupItem value="dated" id="date-dated" />
                            <Label htmlFor="date-dated" class="font-normal">Semana con Fechas (actualmente visible)</Label>
                        </div>
                    </RadioGroup>
                </div>
                 <div class="space-y-3">
                     <Label class="font-semibold">Contenido</Label>
                     <div class="flex items-center space-x-2">
                        <Checkbox 
                            id="include-items"
                            checked={pdfOptions.includeItems}
                            onCheckedChange={(checked) => setPdfOptions(prev => ({...prev, includeItems: !!checked}))}
                        />
                        <Label htmlFor="include-items" class="font-normal">Incluir Elementos Comerciales</Label>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsPdfDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleGeneratePdf} disabled={isGeneratingPdf}>
                    {isGeneratingPdf ? <Spinner size="small" /> : 'Exportar'}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

    
