//src/components/publicidad/advertising-pdf.tsx

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { AdvertisingOrder } from '@/lib/types';
import { format } from 'date-fns';

// Estilos definidos explícitamente para evitar errores de compilación del PDF
const styles = StyleSheet.create({
  page: { 
    padding: 30, 
    fontSize: 10, 
    fontFamily: 'Helvetica' 
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: 20, 
    borderBottomWidth: 1, 
    borderBottomColor: '#ccc', 
    borderBottomStyle: 'solid',
    paddingBottom: 10 
  },
  title: { 
    fontSize: 18, 
    fontWeight: 'bold' 
  },
  section: { 
    marginBottom: 15 
  },
  sectionTitle: { 
    fontSize: 12, 
    fontWeight: 'bold', 
    marginBottom: 5, 
    backgroundColor: '#f0f0f0', 
    padding: 4 
  },
  row: { 
    flexDirection: 'row', 
    marginBottom: 2 
  },
  label: { 
    width: 100, 
    fontWeight: 'bold' 
  },
  value: { 
    flex: 1 
  },
  // Tabla
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#eee',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    alignItems: 'center',
  },
  tableRow: { 
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    borderBottomStyle: 'solid',
    alignItems: 'center',
    minHeight: 20,
  }, 
  tableCol: { 
    padding: 4,
  }, 
  tableCell: { 
    fontSize: 8 
  },
  totals: { 
    marginTop: 10, 
    alignSelf: 'flex-end', 
    width: 200 
  }
});

export const AdvertisingOrderPdf = ({ order }: { order: AdvertisingOrder }) => {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "dd/MM/yyyy");
    } catch {
      return "-";
    }
  };

  const clientName = order?.clientName || "-";
  const agencyName = order?.agencyName || "-";
  const product = order?.opportunityTitle || order?.product || "-";
  const executive = order?.accountExecutive || "-";
  const tangoOrder = order?.tangoOrderNo || "-";
  const srlItems = order?.srlItems || [];
  const sasItems = order?.sasItems || [];
  const totalOrder = order?.totalOrder || 0;

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
              <Text>Fecha: {format(new Date(), "dd/MM/yyyy")}</Text>
              <Text>Ejecutivo: {executive}</Text>
          </View>
        </View>

        {/* DATOS GENERALES */}
        <View style={styles.section}>
          <View style={styles.row}><Text style={styles.label}>Cliente:</Text><Text style={styles.value}>{clientName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Agencia:</Text><Text style={styles.value}>{agencyName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Producto:</Text><Text style={styles.value}>{product}</Text></View>
          <View style={styles.row}>
              <Text style={styles.label}>Vigencia:</Text>
              <Text style={styles.value}>
                  {formatDate(order?.startDate)} al {formatDate(order?.endDate)}
              </Text>
          </View>
          <View style={styles.row}><Text style={styles.label}>Orden Tango:</Text><Text style={styles.value}>{tangoOrder}</Text></View>
        </View>

        {/* DETALLE SRL */}
        {srlItems.length > 0 && (
            <View style={styles.section}>
               <Text style={styles.sectionTitle}>PAUTA AIRE SRL</Text>
               
               <View style={styles.tableHeader}>
                   <View style={[styles.tableCol, { width: '30%' }]}><Text style={styles.tableCell}>Programa</Text></View>
                   <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>Tipo</Text></View>
                   <View style={[styles.tableCol, { width: '10%' }]}><Text style={styles.tableCell}>TV</Text></View>
                   <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>Mes</Text></View>
                   <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>Total Neto</Text></View>
               </View>

               {srlItems.map((item, i) => {
                   const dailySpots = item.dailySpots || {}; 
                   const totalAds = Object.values(dailySpots).reduce((a, b) => a + (Number(b) || 0), 0);
                   const mult = item.adType === 'Spot' ? (item.seconds || 0) : 1;
                   const net = (item.unitRate || 0) * totalAds * mult;
                   
                   return (
                       <View key={i} style={styles.tableRow}>
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

        {/* DETALLE SAS (DIGITAL) */}
        {sasItems.length > 0 && (
            <View style={styles.section}>
               <Text style={styles.sectionTitle}>PAUTA DIGITAL (SAS)</Text>
               
               <View style={styles.tableHeader}>
                   <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>Formato</Text></View>
                   <View style={[styles.tableCol, { width: '25%' }]}><Text style={styles.tableCell}>Detalle</Text></View>
                   <View style={[styles.tableCol, { width: '15%' }]}><Text style={styles.tableCell}>Ubicación</Text></View>
                   <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>Observaciones</Text></View>
                   <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>Total Neto</Text></View>
               </View>

               {sasItems.map((item, i) => {
                   let net = 0;
                   if (item.format === "Banner") {
                       net = (item.cpm || 0) * (item.unitRate || 0);
                   } else {
                       net = (item.unitRate || 0);
                   }

                   // Generar string de ubicaciones marcadas
                   const locations = [];
                   if (item.desktop) locations.push("D");
                   if (item.mobile) locations.push("M");
                   if (item.home) locations.push("H");
                   if (item.interiores) locations.push("I");

                   return (
                       <View key={i} style={styles.tableRow}>
                           <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>{item.format}</Text></View>
                           <View style={[styles.tableCol, { width: '25%' }]}><Text style={styles.tableCell}>{item.detail || item.type || "-"}</Text></View>
                           <View style={[styles.tableCol, { width: '15%' }]}><Text style={styles.tableCell}>{locations.join(", ") || "-"}</Text></View>
                           <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>{item.observations || "-"}</Text></View>
                           <View style={[styles.tableCol, { width: '20%' }]}><Text style={styles.tableCell}>${net.toLocaleString('es-AR')}</Text></View>
                       </View>
                   );
               })}
            </View>
        )}

        {/* TOTALES */}
        <View style={styles.totals}>
            <Text style={{ fontSize: 12, fontWeight: 'bold' }}>Total Pedido: $ {totalOrder.toLocaleString('es-AR')}</Text>
        </View>
        
        <View style={{ marginTop: 30, borderTopWidth: 1, borderTopColor: '#000', borderTopStyle: 'solid', width: 200 }}>
            <Text style={{ textAlign: 'center', marginTop: 5 }}>Firma Cliente</Text>
        </View>

      </Page>
    </Document>
  );
};
