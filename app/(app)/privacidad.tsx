import LegalDocument from '../../components/LegalDocument';

export default function Privacidad() {
  return (
    <LegalDocument
      title="Aviso de Privacidad"
      updated="10 de julio de 2026"
      intro={
        'Jacaranda Lab ("nosotros"), responsable de la aplicación Kahve, un ' +
        'punto de venta para cafeterías, emite el presente aviso de privacidad ' +
        'en cumplimiento de la Ley Federal de Protección de Datos Personales en ' +
        'Posesión de los Particulares (LFPDPPP) de México.'
      }
      sections={[
        {
          heading: 'Datos que recopilamos',
          body: [
            'Datos de cuenta: nombre, correo electrónico, rol dentro del negocio y PIN de acceso (almacenado de forma cifrada).',
            'Datos operativos del negocio: catálogo de productos y sus fotografías, órdenes, ventas, pagos registrados (método y monto — nunca números de tarjeta), propinas, turnos, cortes de caja y movimientos de efectivo.',
            'Datos de clientes finales: el nombre de pila que opcionalmente se captura en una orden para llamar al cliente cuando esté lista.',
          ],
        },
        {
          heading: 'Para qué usamos los datos',
          body: [
            'Operar las funciones de la aplicación: ventas, cola de preparación, reportes y administración de personal.',
            'Brindar soporte técnico cuando lo solicitas.',
            'Administrar tu suscripción y facturación.',
            'No vendemos, rentamos ni compartimos tus datos personales con terceros para fines publicitarios. Kahve no muestra publicidad.',
          ],
        },
        {
          heading: 'Dónde se almacenan',
          body: [
            'La información se aloja en Supabase, nuestro proveedor de infraestructura en la nube, y se transmite siempre cifrada (HTTPS/TLS). El acceso a los datos de cada negocio está aislado: solo los miembros autorizados de tu organización pueden consultarlos.',
          ],
        },
        {
          heading: 'Pagos',
          body: [
            'Los pagos de suscripción se procesan a través de Stripe. Los datos de tu tarjeta los recibe y resguarda directamente Stripe bajo sus propios estándares de seguridad (PCI-DSS); nosotros nunca los almacenamos ni tenemos acceso a ellos.',
          ],
        },
        {
          heading: 'Tus derechos (ARCO)',
          body: [
            'Puedes ejercer en cualquier momento tus derechos de Acceso, Rectificación, Cancelación y Oposición sobre tus datos personales, así como solicitar la eliminación completa de tu cuenta y la información de tu negocio, escribiéndonos a nuestro correo de contacto. Atenderemos tu solicitud en un plazo máximo de 20 días hábiles.',
          ],
        },
        {
          heading: 'Conservación de los datos',
          body: [
            'Conservamos la información mientras tu cuenta esté activa. Si solicitas la eliminación de tu cuenta, los datos se eliminan de nuestros sistemas en un plazo razonable, salvo aquella información que debamos conservar por obligación legal.',
          ],
        },
        {
          heading: 'Menores de edad',
          body: [
            'Kahve es una herramienta de trabajo dirigida a negocios y no está destinada a menores de edad.',
          ],
        },
        {
          heading: 'Cambios a este aviso',
          body: [
            'Podemos actualizar este aviso ocasionalmente. Publicaremos la versión vigente dentro de la app, indicando la fecha de última actualización.',
          ],
        },
      ]}
    />
  );
}
