import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function TermsOfServicePage() {
  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-bold text-foreground">Condiciones del Servicio</h1>
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
            Estos Términos y Condiciones del Servicio ("Términos") rigen su acceso y uso de la aplicación CRM Aire de Santa Fe ("el Servicio"), una herramienta de gestión de relaciones con clientes diseñada para uso interno. Al acceder o utilizar el Servicio, usted acepta estar sujeto a estos Términos.
          </p>

          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">1. Uso del Servicio</h2>
          <p>
            El Servicio es una herramienta interna para los empleados y personal autorizado de Aire de Santa Fe. Su uso está estrictamente limitado a fines comerciales legítimos relacionados con sus responsabilidades laborales.
          </p>
          <ul>
            <li><strong>Cuentas de Usuario:</strong> El acceso al Servicio requiere autenticación a través de una cuenta de Google autorizada. Usted es responsable de mantener la confidencialidad de su cuenta y de todas las actividades que ocurran bajo ella.</li>
            <li><strong>Uso Aceptable:</strong> Usted se compromete a no utilizar el Servicio para ningún propósito ilegal o no autorizado. Se prohíbe el ingreso de datos falsos, maliciosos o no pertinentes a la gestión comercial de la empresa.</li>
          </ul>

          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">2. Propiedad Intelectual</h2>
          <p>
            El Servicio y su contenido original, características y funcionalidades son y seguirán siendo propiedad exclusiva de la empresa. Los datos que usted introduce en el sistema (información de clientes, oportunidades, etc.) son propiedad de la empresa y se consideran información confidencial.
          </p>

          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">3. Integración con Servicios de Terceros</h2>
          <p>
            El Servicio se integra con Google Workspace (Calendar, Drive, Gmail, Chat) para mejorar la productividad. Al autorizar estas integraciones, usted otorga permiso a la aplicación para realizar acciones en su nombre, como se describe en nuestra Política de Privacidad. Su uso de los servicios de Google está sujeto a los términos de servicio de Google.
          </p>

          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">4. Confidencialidad</h2>
          <p>
            Toda la información contenida y gestionada a través de este CRM es estrictamente confidencial. Usted se compromete a no divulgar, compartir o utilizar esta información fuera del ámbito de sus responsabilidades laborales. La violación de esta cláusula puede dar lugar a medidas disciplinarias.
          </p>

          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">5. Terminación</h2>
          <p>
            Podemos suspender o terminar su acceso al Servicio de inmediato, sin previo aviso ni responsabilidad, por cualquier motivo, incluido, entre otros, si usted incumple los Términos. La terminación de su empleo con la empresa resultará en la terminación inmediata de su acceso.
          </p>

          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">6. Limitación de Responsabilidad</h2>
          <p>
            El Servicio se proporciona "TAL CUAL" y "SEGÚN DISPONIBILIDAD". Aunque nos esforzamos por mantener el servicio operativo y preciso, no garantizamos que el servicio funcionará sin interrupciones, de forma segura o disponible en cualquier momento o lugar en particular. En ningún caso la empresa será responsable por daños indirectos, incidentales o consecuentes que surjan del uso o la incapacidad de usar el servicio.
          </p>
          
          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">7. Cambios a los Términos</h2>
          <p>
            Nos reservamos el derecho, a nuestra entera discreción, de modificar o reemplazar estos Términos en cualquier momento. Se le notificará de cualquier cambio material. Al continuar accediendo o utilizando nuestro Servicio después de que esas revisiones entren en vigencia, usted acepta estar sujeto a los términos revisados.
          </p>

          <h2 className="text-2xl font-semibold text-foreground border-b pb-2">8. Contacto</h2>
          <p>
            Si tiene alguna pregunta sobre estos Términos, por favor contacte al administrador de su sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
