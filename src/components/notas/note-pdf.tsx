'use client';

import React from 'react';
import type { CommercialNote, Program } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface NotePdfProps {
  note: Partial<CommercialNote>;
  programs: Program[];
}

const sectionTitleStyle: React.CSSProperties = {
  backgroundColor: '#e5e7eb',
  borderBottom: '2px solid #dc2626',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.02em',
  marginBottom: '5px',
  padding: '5px 7px',
  textTransform: 'uppercase',
  width: '100%',
};

const SectionTitle = ({ title }: { title: string }) => (
  <div style={sectionTitleStyle} data-pdf-keep-together="true">
    {title}
  </div>
);

const Field = ({
  label,
  value,
  fullWidth = false,
}: {
  label: string;
  value?: string | number | null;
  fullWidth?: boolean;
}) => {
  const isUrl = typeof value === 'string' && (value.startsWith('http') || value.startsWith('www.')) && label !== 'Web';
  const displayValue = isUrl ? (value.startsWith('http') ? value : `https://${value}`) : value;

  return (
    <div style={{ marginBottom: 4, width: fullWidth ? '100%' : undefined }} data-pdf-keep-together="true">
      <span style={{ fontSize: 11, fontWeight: 700 }}>{label}: </span>
      {isUrl ? (
        <a
          href={displayValue as string}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 4,
            color: '#1d4ed8',
            display: 'inline-block',
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 6px',
            textDecoration: 'underline',
          }}
        >
          ABRIR ENLACE
        </a>
      ) : (
        <span style={{ fontSize: 11, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value || '-'}</span>
      )}
    </div>
  );
};

export const NotePdf = React.forwardRef<HTMLDivElement, NotePdfProps>(({ note, programs }, ref) => {
  const pageStyle: React.CSSProperties = {
    backgroundColor: 'white',
    boxSizing: 'border-box',
    fontFamily: 'Arial, sans-serif',
    fontSize: 11,
    lineHeight: 1.22,
    minHeight: '297mm',
    padding: '12mm 14mm 14mm',
    position: 'relative',
    width: '210mm',
  };

  const pageContentStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };

  const grid2Style: React.CSSProperties = {
    display: 'grid',
    gap: '4px 14px',
    gridTemplateColumns: '1fr 1fr',
  };

  const pGrafs = note.primaryGrafs && note.primaryGrafs.length > 0 ? note.primaryGrafs : (note.primaryGraf ? [note.primaryGraf] : []);
  const sGrafs = note.secondaryGrafs && note.secondaryGrafs.length > 0 ? note.secondaryGrafs : (note.secondaryGraf ? [note.secondaryGraf] : []);
  const safeInterviewees = note.interviewees?.length
    ? note.interviewees
    : (note.intervieweeName ? [{ name: note.intervieweeName, role: note.intervieweeRole || '', location: 'Piso' }] : []);

  const normalizedLocation = String(note.location || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const isMobileLocation = normalizedLocation === 'movil';

  const renderGrafBox = (label: string, value: string, key: string) => (
    <div
      key={key}
      style={{
        backgroundColor: '#f9fafb',
        border: '1px solid #d1d5db',
        borderRadius: 4,
        padding: 7,
      }}
      data-pdf-keep-together="true"
    >
      <p style={{ color: '#6b7280', fontSize: 9, fontWeight: 700, margin: '0 0 2px', textTransform: 'uppercase' }}>
        {label}
      </p>
      <p style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.15, margin: 0, textTransform: 'uppercase' }}>
        {value}
      </p>
    </div>
  );

  return (
    <div ref={ref}>
      <div id="note-pdf-page-1" style={pageStyle}>
        <header
          style={{
            alignItems: 'center',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 12,
            paddingBottom: 8,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="AIRE Logo" style={{ height: 'auto', width: 76 }} />
          <div style={{ textAlign: 'right' }}>
            <h1 style={{ color: '#dc2626', fontSize: 18, fontWeight: 700, lineHeight: 1, margin: 0 }}>NOTA COMERCIAL</h1>
            <p style={{ color: '#6b7280', fontSize: 10, margin: '4px 0 0' }}>{format(new Date(), "d 'de' MMMM, yyyy", { locale: es })}</p>
            <p style={{ fontSize: 11, fontWeight: 600, margin: '2px 0 0' }}>Asesor: {note.advisorName || '-'}</p>
          </div>
        </header>

        <div style={pageContentStyle}>
          <section data-pdf-keep-together="true">
            <SectionTitle title="1. Detalles de la Nota" />
            <Field label="Titulo" value={note.title} fullWidth />
            <div style={grid2Style}>
              <Field label="Ubicacion" value={note.location} />
              {note.location === 'Llamada' && <Field label="Telefono llamada" value={note.callPhone} />}
              {isMobileLocation && <Field label="Direccion movil" value={note.mobileAddress} />}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 7 }}>
              {pGrafs.map((graf, index) => renderGrafBox('TITULAR.Text (Max 84)', graf, `p-${index}`))}
              {sGrafs.map((graf, index) => renderGrafBox('NOMBRE/FUNCION.Text (Max 55)', graf, `s-${index}`))}
            </div>

            {note.graphicSupport && (
              <div
                style={{
                  backgroundColor: '#fefce8',
                  border: '1px solid #fde047',
                  borderRadius: 4,
                  marginTop: 8,
                  padding: 7,
                }}
                data-pdf-keep-together="true"
              >
                <p style={{ color: '#713f12', fontSize: 11, fontWeight: 700, margin: '0 0 5px', textAlign: 'center' }}>
                  REQUIERE SOPORTE GRAFICO
                </p>
                {(() => {
                  const links = note.graphicSupportLinks?.length ? note.graphicSupportLinks : (note.graphicSupportLink ? [note.graphicSupportLink] : []);
                  if (links.length === 0) return null;
                  return (
                    <div style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 4, padding: 7, textAlign: 'center' }}>
                      <span style={{ color: '#6b7280', fontSize: 9, fontWeight: 700 }}>ENLACES AL MATERIAL:</span>
                      {links.map((link, index) => (
                        <a
                          key={index}
                          href={link.startsWith('http') ? link : `https://${link}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            backgroundColor: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: 4,
                            color: '#1d4ed8',
                            display: 'inline-block',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 8px',
                            textDecoration: 'underline',
                          }}
                        >
                          ENLACE {index + 1}
                        </a>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </section>

          <section data-pdf-keep-together="true">
            <SectionTitle title="2. Datos del Cliente" />
            <div style={grid2Style}>
              <Field label="Cliente" value={note.clientName} />
              <Field label="Razon Social" value={note.razonSocial} />
              <Field label="CUIT" value={note.cuit} />
              <Field label="Rubro" value={note.rubro} />
            </div>
          </section>

          <section data-pdf-keep-together="true">
            <SectionTitle title="3. Produccion y Pautado" />
            <div style={{ ...grid2Style, marginBottom: 6 }}>
              <Field label="Coordinacion (Cliente)" value={note.contactName} />
              <Field label="Telefono coord." value={note.contactPhone} />
            </div>

            <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, marginBottom: 7, padding: 7 }} data-pdf-keep-together="true">
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, textDecoration: 'underline' }}>
                Cronograma / Salidas:
              </span>
              <ul style={{ fontSize: 11, listStyle: 'none', margin: 0, padding: 0 }}>
                {Object.entries(note.schedule || {}).map(([programId, items]) => {
                  const programName = programs.find(program => program.id === programId)?.name || 'Programa';
                  const formattedItems = Array.isArray(items) ? items : [];
                  if (formattedItems.length === 0) return null;
                  return (
                    <li key={programId} style={{ borderLeft: '2px solid #ef4444', marginBottom: 4, paddingLeft: 7 }}>
                      <strong style={{ color: '#b91c1c' }}>{programName}</strong>
                      <div style={{ color: '#374151', marginTop: 1 }}>
                        {formattedItems.map(item => `${format(new Date(item.date), 'dd/MM/yyyy')} a las ${item.time ? item.time : '??:??'}hs`).join(' | ')}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', fontSize: 11, gap: 4, paddingTop: 6 }} data-pdf-keep-together="true">
              <div style={{ display: 'flex', gap: 24 }}>
                <div><strong>Replica Web:</strong> {note.replicateWeb ? 'SI' : 'NO'}</div>
                <div><strong>Replica Redes:</strong> {note.replicateSocials && note.replicateSocials.length > 0 ? note.replicateSocials.join(', ') : 'Ninguna'}</div>
              </div>
              {note.replicateSocials && note.replicateSocials.length > 0 && (
                <div style={{ backgroundColor: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 4, marginTop: 2, padding: 6 }}>
                  <div style={grid2Style}>
                    <div><strong>Colaboracion:</strong> {note.collaboration ? `SI (${note.collaborationHandle})` : 'NO'}</div>
                    <div><strong>CTA:</strong> {note.ctaText || '-'} - {note.ctaDestination || '-'}</div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <div style={{ bottom: 18, color: '#9ca3af', fontSize: 10, position: 'absolute', right: 26 }}>Pagina 1 de 2</div>
      </div>

      <div id="note-pdf-page-2" style={pageStyle}>
        <div style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 10, marginBottom: 8, paddingBottom: 5 }}>
          <strong style={{ color: '#374151', textTransform: 'uppercase' }}>Para conductores / entrevistadores</strong>
          <span style={{ marginLeft: 8 }}>Nota Comercial: {note.title || '-'}</span>
        </div>

        <div style={pageContentStyle}>
          <section data-pdf-keep-together="true">
            <SectionTitle title="4. Entrevistado(s)" />
            {safeInterviewees.map((person, index) => (
              <div
                key={index}
                style={{ borderBottom: index === safeInterviewees.length - 1 ? 'none' : '1px solid #f3f4f6', display: 'grid', gap: '4px 14px', gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 4, paddingBottom: 4 }}
                data-pdf-keep-together="true"
              >
                <Field label="Nombre" value={person.name} />
                <Field label="Cargo" value={person.role} />
                <Field label="Locacion" value={person.location} />
              </div>
            ))}

            {note.intervieweeBio && (
              <div style={{ backgroundColor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 4, marginTop: 7, padding: 7 }} data-pdf-keep-together="true">
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700 }}>Bio / Info adicional:</span>
                <p style={{ color: '#374151', fontSize: 11, fontStyle: 'italic', margin: '3px 0 0' }}>{note.intervieweeBio}</p>
              </div>
            )}
          </section>

          <section data-pdf-keep-together="true">
            <SectionTitle title="5. Canales de Contacto (A mostrar)" />
            <div style={{ ...grid2Style, marginBottom: 6 }}>
              {!note.noWeb && <Field label="Web" value={note.website} />}
              {!note.noWhatsapp && <Field label="WhatsApp" value={note.whatsapp} />}
              {!note.noCommercialPhone && <Field label="Tel. Comercial" value={note.phone} />}
              {note.instagram && <Field label="Instagram" value={note.instagram} />}
            </div>

            {!note.noCommercialAddress && note.commercialAddresses && note.commercialAddresses.length > 0 && (
              <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 5, paddingTop: 5 }} data-pdf-keep-together="true">
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 3 }}>Domicilio(s) comercial(es):</span>
                <ul style={{ fontSize: 11, listStyle: 'disc inside', margin: 0, paddingLeft: 6 }}>
                  {note.commercialAddresses.map((address, index) => (
                    <li key={index} data-pdf-keep-together="true">{address}</li>
                  ))}
                </ul>
              </div>
            )}

            {(note.noWeb && note.noWhatsapp && note.noCommercialPhone && !note.instagram && note.noCommercialAddress) && (
              <p style={{ color: '#6b7280', fontSize: 11, fontStyle: 'italic', margin: 0 }}>No se mostraran canales de contacto.</p>
            )}
          </section>

          <section data-pdf-keep-together="true">
            <SectionTitle title="6. Contenido" />
            <div style={{ marginBottom: 8 }} data-pdf-keep-together="true">
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, textDecoration: 'underline' }}>
                Preguntas sugeridas:
              </span>
              <ol style={{ fontSize: 11, listStyle: 'decimal inside', margin: 0, padding: 0 }}>
                {note.questions?.map((question, index) => (
                  <li key={index} style={{ borderBottom: '1px solid #f3f4f6', padding: '2px 0 2px 6px' }} data-pdf-keep-together="true">
                    {question}
                  </li>
                ))}
              </ol>
            </div>

            {note.topicsToAvoid && note.topicsToAvoid.length > 0 && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: 7 }} data-pdf-keep-together="true">
                <span style={{ color: '#b91c1c', display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, textDecoration: 'underline' }}>
                  Temas a evitar:
                </span>
                <ul style={{ color: '#7f1d1d', fontSize: 11, listStyle: 'disc inside', margin: 0, padding: 0 }}>
                  {note.topicsToAvoid.map((topic, index) => (
                    <li key={index} data-pdf-keep-together="true">{topic}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section data-pdf-keep-together="true">
            <SectionTitle title="7. Observaciones Generales" />
            <div style={{ backgroundColor: '#fefce8', border: '1px solid #e5e7eb', borderRadius: 4, minHeight: 56, padding: 8 }} data-pdf-keep-together="true">
              <p style={{ fontSize: 11, margin: 0, whiteSpace: 'pre-wrap' }}>{note.noteObservations || 'Sin observaciones adicionales.'}</p>
            </div>
          </section>
        </div>

        <div style={{ bottom: 18, color: '#9ca3af', fontSize: 10, position: 'absolute', right: 26 }}>Pagina 2 de 2</div>
      </div>
    </div>
  );
});

NotePdf.displayName = 'NotePdf';
