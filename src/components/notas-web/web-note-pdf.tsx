import React, { forwardRef } from 'react';
import { WebNote } from '@/lib/types';
import { format } from 'date-fns';

interface WebNotePdfProps {
  note: Partial<WebNote>;
}

export const WebNotePdf = forwardRef<HTMLDivElement, WebNotePdfProps>(({ note }, ref) => {
  return (
    <div ref={ref} className="bg-white text-black p-8 w-[210mm] min-h-[297mm] mx-auto text-sm font-sans pdf-block">
      {/* HEADER */}
      <div className="flex justify-between items-start border-b-2 border-orange-500 pb-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-orange-600 uppercase tracking-wider">Notas Web / Gacetillas</h1>
          <p className="text-gray-500 font-medium">Formulario de Carga Comercial</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Fecha de Carga</p>
          <p className="font-bold">{note.createdAt ? format(new Date(note.createdAt), 'dd/MM/yyyy HH:mm') : format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
        </div>
      </div>

      {/* DATOS DEL CLIENTE Y CONTACTO */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 p-3 border border-gray-200 rounded">
          <p className="text-xs text-gray-500 font-bold uppercase">Razón Social / Anunciante</p>
          <p className="font-black text-lg">{note.clientName || '-'}</p>
        </div>
        <div className="bg-gray-50 p-3 border border-gray-200 rounded">
          <p className="text-xs text-gray-500 font-bold uppercase">Ejecutivo de Cuentas</p>
          <p className="font-bold text-lg">{note.advisorName || '-'}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="border-b pb-2">
          <p className="text-xs text-gray-500 font-bold uppercase">Contacto Coordinación</p>
          <p className="font-bold">{note.contactName || '-'}</p>
        </div>
        <div className="border-b pb-2">
          <p className="text-xs text-gray-500 font-bold uppercase">Teléfono Contacto</p>
          <p className="font-bold">{note.contactPhone || '-'}</p>
        </div>
        <div className="border-b pb-2">
          <p className="text-xs text-gray-500 font-bold uppercase">Web / Red Social Cliente</p>
          <p className="font-bold">{note.clientWebOrSocial || '-'}</p>
        </div>
      </div>

      {/* OBJETIVO Y FORMATO */}
      <div className="mb-6">
        <h3 className="bg-orange-100 text-orange-800 font-bold p-2 uppercase text-xs mb-3 border-l-4 border-orange-500">
          Especificaciones de Contenido
        </h3>
        <div className="mb-4">
          <p className="text-xs text-gray-500 font-bold uppercase mb-1">Objetivo del Contenido</p>
          <p className="bg-gray-50 p-3 rounded border text-sm">{note.objective || '-'}</p>
        </div>
        <div className="grid grid-cols-2 gap-6">
            <div>
                <p className="text-xs text-gray-500 font-bold uppercase mb-2">Producto Web / Tipo de Contenido</p>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded font-bold text-blue-900">
                    {note.format || '-'}
                </div>
            </div>
            <div>
                <p className="text-xs text-gray-500 font-bold uppercase mb-2">Soporte de Imágenes (Origen)</p>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded font-bold text-amber-900 mb-2">
                    {note.imageSupport || '-'}
                </div>
                {note.inserts && (
                    <div>
                        <span className="text-xs text-gray-500 font-bold uppercase">Inserts de apoyo: </span>
                        <span className="font-semibold">{note.inserts}</span>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* REDES SOCIALES */}
      <div className="mb-6">
        <h3 className="bg-orange-100 text-orange-800 font-bold p-2 uppercase text-xs mb-3 border-l-4 border-orange-500">
          Replicación en Redes Sociales
        </h3>
        
        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 border p-3 rounded">
                <div className="flex justify-between items-center border-b pb-1">
                    <span className="font-bold">Publicación en IG Story de la nota</span>
                    <span className="font-black text-lg">{note.repIgStory ? 'SÍ' : 'NO'}</span>
                </div>
                {note.repIgStory && (
                    <div className="flex justify-between text-sm text-gray-600">
                        <span>Origen:</span>
                        <span className="font-bold">{note.repIgStoryProducer || 'No especificado'}</span>
                    </div>
                )}
            </div>

            <div className="space-y-2 border p-3 rounded">
                <div className="flex justify-between items-center border-b pb-1">
                    <span className="font-bold">Publicación en IG Reels</span>
                    <span className="font-black text-lg">{note.repIgReel ? 'SÍ' : 'NO'}</span>
                </div>
                {note.repIgReel && (
                    <div className="flex justify-between text-sm text-gray-600">
                        <span>Origen:</span>
                        <span className="font-bold">{note.repIgReelProducer || 'No especificado'}</span>
                    </div>
                )}
            </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
            <div className="border p-2 rounded flex justify-between items-center">
                <span>Facebook Link:</span>
                <span className="font-bold">{note.repFacebook ? 'SÍ' : 'NO'}</span>
            </div>
            <div className="border p-2 rounded flex justify-between items-center">
                <span>Twitter Link:</span>
                <span className="font-bold">{note.repTwitter ? 'SÍ' : 'NO'}</span>
            </div>
            <div className="border p-2 rounded flex justify-between items-center">
                <span>¿Colaboración en Reel?</span>
                <span className="font-bold">{note.collaborateReel ? 'SÍ' : 'NO'}</span>
            </div>
        </div>

        <div className="mt-4 bg-gray-50 p-2 rounded border flex gap-2 items-center">
            <span className="text-gray-500 text-xs font-bold uppercase">IG a Etiquetar:</span>
            <span className="font-bold">{note.clientIgHandle || 'No aplica'}</span>
        </div>
      </div>

      {/* MATERIALES Y OBSERVACIONES */}
      <div className="mb-6">
        <h3 className="bg-orange-100 text-orange-800 font-bold p-2 uppercase text-xs mb-3 border-l-4 border-orange-500">
          Materiales y Observaciones
        </h3>
        <div className="space-y-4">
            <div>
                <p className="text-xs text-gray-500 font-bold uppercase mb-1">Link de Material de Apoyo (Drive/Nube)</p>
                <div className="bg-gray-50 p-2 border rounded">
                    {note.materialUrl ? (
                        <a href={note.materialUrl} target="_blank" rel="noreferrer" className="text-blue-600 break-all text-xs underline">
                            {note.materialUrl}
                        </a>
                    ) : (
                        <span className="text-gray-400 italic text-sm">Sin material adjunto</span>
                    )}
                </div>
            </div>
            <div>
                <p className="text-xs text-gray-500 font-bold uppercase mb-1">Observaciones / Instrucciones Adicionales</p>
                <p className="bg-gray-50 p-3 border rounded text-sm min-h-[60px] whitespace-pre-wrap">
                    {note.observations || 'Sin observaciones.'}
                </p>
            </div>
        </div>
      </div>

      {note.orderTitle && (
          <div className="mt-8 text-center text-xs text-gray-400">
              Esta ejecución está vinculada a la orden de publicidad: {note.orderTitle}
          </div>
      )}
    </div>
  );
});

WebNotePdf.displayName = 'WebNotePdf';
