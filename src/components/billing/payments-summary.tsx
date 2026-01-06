'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export type PaymentSummaryRow = {
  advisorId: string;
  advisorName: string;
  ranges: {
    '1-30': number;
    '31-60': number;
    '61-90': number;
    '90+': number;
  };
  total: number;
};

const formatCurrency = (value: number) => `$${value.toLocaleString('es-AR')}`;

export function PaymentsSummary({ rows }: { rows: PaymentSummaryRow[] }) {
  const overall = rows.reduce(
    (acc, row) => {
      acc['1-30'] += row.ranges['1-30'];
      acc['31-60'] += row.ranges['31-60'];
      acc['61-90'] += row.ranges['61-90'];
      acc['90+'] += row.ranges['90+'];
      acc.total += row.total;
      return acc;
    },
    { '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de mora por asesor</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asesor</TableHead>
                <TableHead className="text-right">1 a 30 días</TableHead>
                <TableHead className="text-right">31 a 60 días</TableHead>
                <TableHead className="text-right">61 a 90 días</TableHead>
                <TableHead className="text-right">Más de 90 días</TableHead>
                <TableHead className="text-right">Total en mora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No hay facturación en mora para resumir.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {rows.map((row) => (
                    <TableRow key={row.advisorId || row.advisorName}>
                      <TableCell className="font-medium">{row.advisorName || 'Sin asignar'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.ranges['1-30'])}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.ranges['31-60'])}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.ranges['61-90'])}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.ranges['90+'])}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(row.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{formatCurrency(overall['1-30'])}</TableCell>
                    <TableCell className="text-right">{formatCurrency(overall['31-60'])}</TableCell>
                    <TableCell className="text-right">{formatCurrency(overall['61-90'])}</TableCell>
                    <TableCell className="text-right">{formatCurrency(overall['90+'])}</TableCell>
                    <TableCell className="text-right">{formatCurrency(overall.total)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
