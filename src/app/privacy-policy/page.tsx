import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-bold text-foreground">Política de Privacidad</h1>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al Inicio
            </Link>
          </Button>
        </header>
        
        <div className="space-y-6 text-foreground/80 prose prose-lg dark:prose-invert">
          <p><strong>Última actualización:</strong> 25 de julio de 2024</p>
          
          <p>
            Bienvenido a CRM Aire de Santa Fe. Su privacidad es de suma importancia para nosotros. Esta Política de Privacidad describe cómo recopilamos, usamos, procesamos y divulgamos su información, incluida la información personal, en conjunto con su acceso y uso de nuestra aplicación CRM.
          </p>

          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">1. Información que Recopilamos</h2>
          <p>Recopilamos tres categorías principales de información:</p>

          <h3 className="text-xl font-semibold text-foreground">1.1. Información que Usted Nos Proporciona</h3>
          <ul>
            <li>
              <strong>Información de la Cuenta:</strong> Cuando se registra a través de Google Sign-In, recibimos la información de su perfil de Google, que incluye su nombre, dirección de correo electrónico y foto de perfil.
            </li>
            <li>
              <strong>Datos del CRM:</strong> Recopilamos la información que usted introduce activamente en la aplicación, como detalles de clientes, contactos, oportunidades, canjes, actividades, tareas y facturación.
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-foreground">1.2. Información Recopilada desde Servicios de Terceros (Google)</h3>
          <p>
            Para proporcionar funcionalidades integradas, solicitamos acceso a ciertos datos de su cuenta de Google. Este acceso se solicita solo cuando es necesario para una función específica.
          </p>
          <ul>
            <li>
              <strong>Google Calendar:</strong> Solicitamos permiso para crear, ver y eliminar eventos en su calendario con el fin de programar recordatorios de tareas y vencimientos de pautas. Solo interactuamos con eventos creados por esta aplicación.
            </li>
            <li>
              <strong>Google Drive:</strong> Solicitamos permiso para subir archivos (avatares, propuestas) a una carpeta específica en su Google Drive creada para esta aplicación. Esto nos permite almacenar y acceder a archivos relacionados con el CRM.
            </li>
            <li>
              <strong>Google Chat:</strong> Solicitamos permiso para enviar mensajes y leer información básica de los espacios de chat para notificar sobre eventos importantes del CRM.
            </li>
            <li>
              <strong>Gmail:</strong> Solicitamos permiso para enviar correos electrónicos en su nombre. Esta funcionalidad se utiliza exclusivamente para enviar notificaciones relacionadas con el flujo de trabajo del CRM. No leemos, eliminamos ni gestionamos sus correos electrónicos.
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-foreground">1.3. Información Recopilada Automáticamente</h3>
          <p>
            Podemos recopilar información sobre su uso de la plataforma, como registros de actividad (creación, actualización, eliminación de entidades) para fines de auditoría y seguimiento interno del equipo.
          </p>

          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">2. Cómo Usamos la Información que Recopilamos</h2>
          <p>Utilizamos la información para los siguientes fines:</p>
          <ul>
            <li>Proporcionar, operar y mejorar la funcionalidad principal del CRM.</li>
            <li>Gestionar el acceso y la autenticación de los usuarios.</li>
            <li>Facilitar la comunicación interna del equipo a través de notificaciones.</li>
            <li>Integrar recordatorios y eventos en su Google Calendar.</li>
            <li>Almacenar archivos y documentos relevantes en su Google Drive.</li>
            <li>Mantener un registro de auditoría de las acciones realizadas para la transparencia y seguridad del equipo.</li>
          </ul>

          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">3. Intercambio y Divulgación de Información</h2>
          <p>
            Su información se comparte de las siguientes maneras:
          </p>
          <ul>
            <li>
              <strong>Dentro de su Organización:</strong> La información del CRM (clientes, oportunidades, etc.) es visible para otros usuarios de su organización según los roles y permisos definidos (Asesor, Jefe, Gerencia, etc.).
            </li>
            <li>
              <strong>Servicios de Google:</strong> La información se comparte con los servicios de Google (Calendar, Drive, Gmail, Chat) solo cuando usted inicia una acción que requiere dicha integración. El uso de sus datos por parte de Google se rige por la Política de Privacidad de Google.
            </li>
            <li>
              <strong>Cumplimiento Legal:</strong> No compartiremos su información con terceros, excepto cuando sea requerido por ley, citación judicial u otra solicitud gubernamental.
            </li>
          </ul>

          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">4. Seguridad de los Datos</h2>
          <p>
            Nos tomamos muy en serio la seguridad de sus datos. La aplicación está alojada en Firebase, una plataforma de Google que proporciona robustas medidas de seguridad. Utilizamos la autenticación de Firebase para asegurar el acceso a la aplicación y reglas de seguridad de Firestore para controlar el acceso a los datos.
          </p>

          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">5. Sus Derechos</h2>
          <p>
            Usted tiene derecho a acceder, actualizar y eliminar su información personal. Puede actualizar la información de su perfil en la página de configuración. Para la eliminación de su cuenta y datos asociados, por favor contacte al administrador del sistema.
          </p>

          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">6. Cambios a esta Política de Privacidad</h2>
          <p>
            Nos reservamos el derecho de modificar esta Política de Privacidad en cualquier momento. Si realizamos cambios, publicaremos la política revisada en esta página y actualizaremos la fecha de "Última actualización".
          </p>

          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">7. Contacto</h2>
          <p>
            Si tiene alguna pregunta o queja sobre esta Política de Privacidad o nuestras prácticas de manejo de información, por favor contacte al administrador de su sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
