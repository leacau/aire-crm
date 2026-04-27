import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO, startOfMonth, isSameMonth, isBefore, differenceInDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Opportunity, PaymentEntry, CoachingSession, User } from './types';

interface AdvisorReportData {
    advisor: User;
    opportunities: Opportunity[];
    payments: PaymentEntry[];
    coaching: CoachingSession | null;
}

export const generateAdvisorsPdfReport = (data: AdvisorReportData[]) => {
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
    });

    const today = new Date();
    const monthStart = startOfMonth(today);

    data.forEach((item, index) => {
        if (index > 0) doc.addPage();

        const { advisor, opportunities, payments, coaching } = item;

        // Título del Asesor
        doc.setFontSize(18);
        doc.text(`Informe de Gestión: ${advisor.name}`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Fecha de generación: ${format(today, "PPP", { locale: es })}`, 14, 22);

        let currentY = 30;

        // --- SECCIÓN 1: OPORTUNIDADES ---
        doc.setFontSize(14);
        doc.setTextColor(40, 40, 40);
        doc.text('Oportunidades', 14, currentY);
        currentY += 5;

        const working = opportunities.filter(o => ['Propuesta', 'Negociación', 'Negociación a Aprobar'].includes(o.stage));
        const closed = opportunities.filter(o => o.stage === 'Cerrado - Ganado' && isSameMonth(parseISO(o.createdAt), monthStart));
        const recurring = opportunities.filter(o => o.stage === 'Cerrado - Ganado' && isBefore(parseISO(o.createdAt), monthStart));

        const oppRows: any[] = [];
        
        const addOppGroup = (title: string, list: Opportunity[]) => {
            if (list.length === 0) return;
            oppRows.push([{ content: title, colSpan: 4, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } }]);
            let subtotal = 0;
            list.forEach(o => {
                oppRows.push([o.clientName, o.title, `$${o.value.toLocaleString('es-AR')}`, o.stage]);
                subtotal += o.value;
            });
            oppRows.push([{ content: `Subtotal ${title}: $${subtotal.toLocaleString('es-AR')}`, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } }]);
        };

        addOppGroup('Trabajando', working);
        addOppGroup('Cerrados (Mes Actual)', closed);
        addOppGroup('Recurrentes', recurring);

        autoTable(doc, {
            startY: currentY,
            head: [['Cliente', 'Propuesta', 'Valor', 'Estado']],
            body: oppRows.length > 0 ? oppRows : [['No hay oportunidades registradas', '', '', '']],
            theme: 'striped',
            headStyles: { fillColor: [220, 53, 69] },
            margin: { left: 14 },
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;

        // --- SECCIÓN 2: MORA ---
        if (currentY > 180) { doc.addPage(); currentY = 20; }
        doc.setFontSize(14);
        doc.text('Resumen de Mora', 14, currentY);
        currentY += 5;

        const buckets = {
            'Sin Vencer': payments.filter(p => (p.daysLate || 0) <= 0),
            '1-30 días': payments.filter(p => (p.daysLate || 0) > 0 && (p.daysLate || 0) <= 30),
            '31-60 días': payments.filter(p => (p.daysLate || 0) > 30 && (p.daysLate || 0) <= 60),
            '61-90 días': payments.filter(p => (p.daysLate || 0) > 60 && (p.daysLate || 0) <= 90),
            '+90 días': payments.filter(p => (p.daysLate || 0) > 90),
        };

        const moraRows: any[] = [];
        Object.entries(buckets).forEach(([label, list]) => {
            if (list.length === 0) return;
            moraRows.push([{ content: `Mora: ${label}`, colSpan: 4, styles: { fillColor: [245, 245, 245], fontStyle: 'bold' } }]);
            let subtotal = 0;
            list.forEach(p => {
                const dateStr = p.dueDate ? format(parseISO(p.dueDate), 'dd/MM/yyyy') : (p.issueDate ? format(parseISO(p.issueDate), 'dd/MM/yyyy') : '-');
                moraRows.push([p.razonSocial || p.company, `$${(p.amount || 0).toLocaleString('es-AR')}`, dateStr, p.notes || '-']);
                subtotal += (p.amount || 0);
            });
            moraRows.push([{ content: `Total ${label}: $${subtotal.toLocaleString('es-AR')}`, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } }]);
        });

        autoTable(doc, {
            startY: currentY,
            head: [['Cliente', 'Monto', 'Vencimiento', 'Última Nota']],
            body: moraRows.length > 0 ? moraRows : [['No hay registros de mora', '', '', '']],
            theme: 'grid',
            headStyles: { fillColor: [255, 152, 0] },
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;

        // --- SECCIÓN 3: SEGUIMIENTO ---
        if (currentY > 180) { doc.addPage(); currentY = 20; }
        doc.setFontSize(14);
        doc.text('Seguimiento Semanal (Sesión Activa)', 14, currentY);
        currentY += 5;

        const seguimientoRows = coaching?.items.map(item => {
            const lastNote = item.advisorNotes ? item.advisorNotes.split('\n\n').pop() : '';
            const dateMatch = lastNote?.match(/\[Agregado (.*?)\]/);
            const dateStr = dateMatch ? dateMatch[1] : '-';
            const cleanText = lastNote?.replace(/\[Agregado .*?\] /, '') || item.action;
            
            return [
                item.entityName,
                item.status,
                dateStr,
                cleanText
            ];
        }) || [];

        autoTable(doc, {
            startY: currentY, head: [['Entidad', 'Estado Tarea', 'Última Act.', 'Detalle Bitácora']],
            body: seguimientoRows.length > 0 ? seguimientoRows : [['No hay sesión de seguimiento activa', '', '', '']],
            theme: 'striped',
            headStyles: { fillColor: [0, 123, 255] },
            columnStyles: { 3: { cellWidth: 100 } }
        });
    });

    const fileName = data.length === 1 
        ? `Reporte_${data[0].advisor.name.replace(/\s/g, '_')}_${format(today, 'yyyy-MM-dd')}.pdf`
        : `Reporte_Consolidado_Equipo_${format(today, 'yyyy-MM-dd')}.pdf`;
    
    doc.save(fileName);
};
