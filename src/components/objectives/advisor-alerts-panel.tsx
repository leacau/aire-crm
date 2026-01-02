'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import type { AdvisorAlert } from '@/lib/advisor-alerts';

const severityIconMap: Record<AdvisorAlert['severity'], React.ReactNode> = {
  critical: <AlertTriangle className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
};

interface AdvisorAlertsPanelProps {
  alerts: AdvisorAlert[];
  pendingEmailCount: number;
  isSendingEmail: boolean;
  lastEmailSentAt: string | null;
  onSendEmail?: () => void;
  emailError?: string | null;
  needsEmailAuth?: boolean;
  onAlertSelect?: (alert: AdvisorAlert) => void;
}

export function AdvisorAlertsPanel({
  alerts,
  pendingEmailCount,
  isSendingEmail,
  lastEmailSentAt,
  onSendEmail,
  emailError,
  needsEmailAuth,
  onAlertSelect,
}: AdvisorAlertsPanelProps) {
  const hasAlerts = alerts.length > 0;
  const variantForAlert = (alert: AdvisorAlert) => (alert.severity === 'critical' ? 'destructive' : 'default');

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between">
          <CardTitle>Alertas del asesor</CardTitle>
          {pendingEmailCount > 0 && (
            <Badge variant="destructive">{pendingEmailCount} email(s) pendientes</Badge>
          )}
        </div>
        <CardDescription>
          Control automático de prospectos, propuestas y facturación que requieren tu atención.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasAlerts ? (
          <div className="space-y-3">
            {alerts.map(alert => (
              <Alert key={alert.id} variant={variantForAlert(alert)}>
                {severityIconMap[alert.severity]}
                <div>
                  <AlertTitle className="flex items-center gap-2">
                    {alert.title}
                    <Badge variant="secondary" className="uppercase text-[10px]">{alert.type}</Badge>
                  </AlertTitle>
                  <AlertDescription>
                    <p>{alert.description}</p>
                    {alert.meta && alert.meta.length > 0 && (
                      <dl className="mt-2 grid gap-1 text-xs">
                        {alert.meta.map(item => (
                          <div key={`${alert.id}-${item.label}`} className="flex items-center justify-between">
                            <dt className="text-muted-foreground">{item.label}</dt>
                            <dd className="font-medium text-right">{item.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {alert.entityHref && (
                      onAlertSelect ? (
                        <Button
                          variant="link"
                          className="mt-2 h-auto px-0 text-xs font-semibold"
                          onClick={() => onAlertSelect(alert)}
                        >
                          Ver detalle
                        </Button>
                      ) : (
                        <Link href={alert.entityHref} className="mt-2 inline-flex text-xs font-semibold text-primary hover:underline">
                          Ver detalle
                        </Link>
                      )
                    )}
                  </AlertDescription>
                </div>
              </Alert>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            No hay alertas activas para tus cuentas.
          </div>
        )}

        {pendingEmailCount > 0 && onSendEmail && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={onSendEmail} disabled={isSendingEmail}>
                {isSendingEmail ? (
                  <div className="flex items-center gap-2">
                    <Spinner size="small" /> Enviando alertas
                  </div>
                ) : (
                  'Enviar alertas por email'
                )}
              </Button>
              {needsEmailAuth && (
                <p className="text-xs text-muted-foreground">
                  Necesitamos tu autorización de Gmail para enviar recordatorios automáticos.
                </p>
              )}
            </div>
            {emailError && <p className="text-sm text-destructive">{emailError}</p>}
          </div>
        )}

        {lastEmailSentAt && (
          <p className="text-xs text-muted-foreground">
            Último envío automático: {format(new Date(lastEmailSentAt), 'PPP p', { locale: es })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
