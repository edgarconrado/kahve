import LegalDocument from '../../components/LegalDocument';

export default function Terminos() {
  return (
    <LegalDocument
      title="Términos de Uso"
      updated="10 de julio de 2026"
      sections={[
        {
          heading: '1. Aceptación',
          body: [
            'Al crear una cuenta o usar Kahve aceptas estos Términos de Uso. Kahve es operada por Jacaranda Lab ("nosotros").',
          ],
        },
        {
          heading: '2. El servicio',
          body: [
            'Kahve es una aplicación de punto de venta para cafeterías que permite registrar ventas, administrar una cola de preparación, gestionar turnos y cortes de caja, consultar reportes y administrar al personal del negocio. Se ofrece bajo un modelo de suscripción con un plan gratuito de funciones limitadas y un plan de paga ("Kahve Pro").',
          ],
        },
        {
          heading: '3. Tu cuenta y tu equipo',
          body: [
            'El administrador de cada organización es responsable de las cuentas de empleado que crea, de asignar los roles apropiados y de mantener la confidencialidad de los PIN de acceso. Las acciones realizadas desde una cuenta se consideran realizadas por su titular.',
          ],
        },
        {
          heading: '4. Planes, pagos y renovación',
          body: [
            'Las organizaciones nuevas reciben un periodo de prueba del plan Pro; al concluir, la cuenta pasa automáticamente al plan gratuito si no se contrata una suscripción.',
            'La suscripción a Kahve Pro se cobra por adelantado (mensual o anual) a través de Stripe y se renueva automáticamente hasta que se cancele.',
            'Puedes cancelar en cualquier momento desde la app; conservarás el acceso Pro hasta el final del periodo ya pagado. No se otorgan reembolsos por periodos parciales.',
            'Los precios pueden cambiar; te lo notificaremos con al menos 30 días de anticipación.',
          ],
        },
        {
          heading: '5. Tus datos son tuyos',
          body: [
            'La información de tu negocio (productos, ventas, reportes) te pertenece. Nos otorgas únicamente la licencia necesaria para almacenarla y procesarla con el fin de prestarte el servicio.',
          ],
        },
        {
          heading: '6. Uso aceptable',
          body: [
            'Te comprometes a no usar Kahve para actividades ilícitas, a no intentar vulnerar la seguridad del servicio ni acceder a datos de otras organizaciones, y a no revender o sublicenciar el servicio sin nuestra autorización por escrito.',
          ],
        },
        {
          heading: '7. Disponibilidad y respaldo',
          body: [
            'Trabajamos para que Kahve esté disponible de forma continua, pero el servicio se ofrece "tal cual" y puede experimentar interrupciones. Te recomendamos verificar tus cortes de caja contra tus registros físicos. Kahve es una herramienta de registro operativo y no constituye asesoría contable ni fiscal.',
          ],
        },
        {
          heading: '8. Limitación de responsabilidad',
          body: [
            'En la máxima medida permitida por la ley, nuestra responsabilidad total frente a ti se limita al monto que nos hayas pagado por la suscripción en los tres meses anteriores al hecho que la origine.',
          ],
        },
        {
          heading: '9. Propiedad intelectual',
          body: [
            'Kahve, su nombre, logotipo, diseño y código son propiedad de Jacaranda Lab. Estos términos únicamente te otorgan una licencia de uso personal, revocable y no exclusiva mientras tu cuenta esté activa.',
          ],
        },
        {
          heading: '10. Terminación',
          body: [
            'Puedes dejar de usar el servicio y solicitar la eliminación de tu cuenta en cualquier momento. Podemos suspender o cancelar cuentas que incumplan estos términos.',
          ],
        },
        {
          heading: '11. Ley aplicable',
          body: [
            'Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia se someterá a los tribunales competentes de Guadalajara, Jalisco.',
          ],
        },
      ]}
    />
  );
}
