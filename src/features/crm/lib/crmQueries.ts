// Claves de TanStack Query del CRM, en un solo sitio.
//
// Por qué centralizarlas: invalidar mal es la causa número uno de «he guardado
// y no se ve». Con las claves aquí, un `queryClient.invalidateQueries` no se
// escribe a mano en cada componente.
//
// `crmKeys.perfiles` reusa DELIBERADAMENTE la clave 'userProfiles' que ya
// comparten ClientsScreen, ReviewsScreen, CommandPalette, CardioCoachScreen,
// NutritionPlansScreen, AcademyCoachScreen y MesocycleManager. Así, editar el
// teléfono de un cliente desde el CRM refresca también la caché de esas
// pantallas, y no se descarga dos veces la misma lista.

export const crmKeys = {
  perfiles: ['userProfiles'] as const,
  contactos: ['crmContactos'] as const,
  servicios: ['crmServicios'] as const,
  serviciosDe: (clientId: string) => ['crmServicios', clientId] as const,
  pagos: ['crmPagos'] as const,
  pagosDe: (clientId: string) => ['crmPagos', clientId] as const,
  suscripciones: ['crmSuscripciones'] as const,
  suscripcionesDe: (clientId: string) => ['crmSuscripciones', clientId] as const,
};
