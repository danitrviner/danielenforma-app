// Evento global para abrir el panel de chat IA desde componentes que no lo
// tienen montado directamente (p.ej. el chip de PendingTray en ClientHub).
// Vive en su propio módulo neutral para no forzar el chunk lazy de
// AiChatPanel a cargarse desde sitios que solo necesitan el nombre del evento.
export const OPEN_AI_PANEL_EVENT = 'ai:open';

// detail.prompt opcional: precarga el input del chat (sin enviarlo solo) —
// mismo gesto que los chips de sugerencia del propio panel, para que el
// coach pueda revisar/editar antes de enviar.
export type OpenAiPanelDetail = { prompt?: string };
