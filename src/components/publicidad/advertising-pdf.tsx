//src/components/publicidad/advertising-pdf.tsx

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { AdvertisingOrder } from '@/lib/types';
import { format } from 'date-fns';

// Estilos básicos para el PDF
const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 10, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottom: '1 solid #ccc', paddingBottom: 10 },
  title: { fontSize: 18, fontWeight: 'bold' },
  section: { marginBottom: 15 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 5, backgroundColor: '#f0f0f0', padding: 4 },
  row: { flexDirection: 'row', marginBottom: 2 },
  label: { width: 100, fontWeight: 'bold' },
  value: { flex: 1 },
  // Eliminamos 'display: flex' explícito ya que es el default y a veces causa conflictos en versiones viejas
  table: { width: "auto", borderStyle: "solid", borderRightWidth: 0, borderBottomWidth: 0 }, 
  tableRow: { margin: "auto", flexDirection: "row" }, 
  tableCol: { borderStyle: "solid", borderLeftWidth: 1, borderTopWidth: 1, padding: 3 }, 
  tableCell: { margin: "auto", fontSize: 8 },
  totals: { marginTop: 10, alignSelf: 'flex-end', width: 200 }
});

export const AdvertisingOrderPdf = ({ order }: { order: AdvertisingOrder }) => {
  // Protección contra fechas inválidas
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "-";
    try {
        return format(new Date(dateString), "dd/MM/yyyy");
    } catch (e) {
        return "-";
    }
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <View>
              <Text style={styles.title}>ORDEN DE PUBLICIDAD</Text>
              <Text>Aire de Santa Fe</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
              <Text>Fecha Emisión: {format(new Date(), "dd/MM/yyyy")}</Text>
              <Text>Ejecutivo: {order?.accountExecutive || "-"}</Text>
          </View>
        </View>

        {/* DATOS GENERALES */}
        <View style={styles.section}>
          <View style={styles.row}><Text style={styles.label}>Cliente:</Text><Text style={styles.value}>{order?.clientName || "-"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Agencia:</Text><Text style={styles.value}>{order?.agencyName || "-"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Producto:</Text><Text style={styles.value}>{order?.opportunityTitle || order?.product || "-"}</Text></View>
          <View style={styles.row}>
              <Text style={styles.label}>Vigencia:</Text>
              <Text style={styles.value}>
                  {formatDate(order?.startDate)} al {formatDate(order?.endDate)}
              </Text>
          </View>
          <View style={styles.row}><Text style={styles.label}>Orden Tango:</Text><Text style={styles.value}>{order?.tangoOrderNo || "-"}</Text></View>
        </View>

        {/* DETALLE SRL */}
        {order?.srlItems && order.srlItems.length > 0 && (
            <View style={styles.section}>
               <Text style={styles.sectionTitle}>PAUTA AIRE SRL</Text>
               <View style={[styles.tableRow, { backgroundColor: '#eee' }]}>
                   <View style={[styles.tableCol, { width: '30%' }]}><Text style={styles.tableCell}>Programa</Text></View>
                   <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>Tipo</Text></View>
                   <View style={[styles.tableCol, { width: '10%' }]}><Text style={styles.tableCell}>TV</Text></View>
                   <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>Mes</Text></View>
                   <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>Total Neto</Text></View>
               </View>
               {order.srlItems.map((item, i) => {
                   // PROTECCIÓN CRÍTICA: dailySpots puede ser undefined en previews
                   const dailySpots = item.dailySpots || {}; 
                   const totalAds = Object.values(dailySpots).reduce((a, b) => a + (Number(b) || 0), 0);
                   const mult = item.adType === 'Spot' ? (item.seconds || 0) : 1;
                   const net = (item.unitRate || 0) * totalAds * mult;
                   
                   return (
                       <View key={i} style={styles.tableRow}>
                           {/* Aseguramos que cada hijo Text reciba un string válido, nunca null/undefined */}
                           <View style={[styles.tableCol, { width: '30%' }]}><Text style={styles.tableCell}>{item.programId || "-"}</Text></View>
                           <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>{item.adType || "-"}</Text></View>
                           <View style={[styles.tableCol, { width: '10%' }]}><Text style={styles.tableCell}>{item.hasTv ? 'SI' : 'NO'}</Text></View>
                           <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>{item.month || "-"}</Text></View>
                           <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>${net.toLocaleString('es-AR')}</Text></View>
                       </View>
                   );
               })}
            </View>
        )}

        {/* TOTALES */}
        <View style={styles.totals}>
            <Text style={{ fontSize: 12, fontWeight: 'bold' }}>Total Pedido: $ {(order?.totalOrder || 0).toLocaleString('es-AR')}</Text>
        </View>
        
        <View style={{ marginTop: 30, borderTop: '1 solid #000', width: 200 }}>
            <Text style={{ textAlign: 'center', marginTop: 5 }}>Firma Cliente</Text>
        </View>

      </Page>
    </Document>
  );
};
