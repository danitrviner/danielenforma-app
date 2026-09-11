// Evento global para abrir el panel de chat IA desde componentes que no lo
// tienen montado directamente (p.ej. el chip de PendingTray en ClientHub).
// Vive en su propio módulo neutral para no forzar el chunk lazy de
// AiChatPanel a cargarse desde sitios que solo necesitan el nombre del evento.
export const OPEN_AI_PANEL_EVENT = 'ai:open';

// detail.prompt opcional: precarga el input del chat (sin enviarlo solo) —
// mismo gesto que los chips de sugerencia del propio panel, para que el
// coach pueda revisar/editar antes de enviar.
// detail.enviar: en vez de precargar el input, abre un chat nuevo sobre el
// cliente activo y manda el prompt directamente. Es lo que hacen los botones
// de tarea («Montar el primer mes», «Preparar la revisión», «Montar el mes
// siguiente»): el texto es un guion fijo que no hay nada que revisar, y las
// propuestas que salgan igualmente pasan por Aprobar.
export type OpenAiPanelDetail = { prompt?: string; enviar?: boolean };
