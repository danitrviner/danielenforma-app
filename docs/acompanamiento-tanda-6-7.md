# Acompañamiento · Tandas 6 y 7 · La vuelta sin culpa y WhatsApp como canal de la app

29-10-2026 · rama `acompanamiento-6-7-vuelta-whatsapp` (apilada sobre la galería) · plan §6 y §7 · hallazgos H-18, resto de H-17, H-09, H-24 (sustituido por WhatsApp, decisión de Dani).

## Qué cambia para el atleta

- **Vuelve tras ≥ 3 días sin registrar** y lo primero que ve en Inicio es «Bienvenido de vuelta. Hoy, solo lo de hoy: la sesión y el peso. Lo demás ya lo cuadra Dani contigo.» (sin firma: lo escribe la app). Dos versiones en la galería (banda / línea).
- **Las sesiones no hechas dejan de ser rojas** en «Esta semana»: tachadas en gris. Una sesión perdida es un hecho, no una alarma.
- **El reto vuelve a suave** tras una semana sin registrar (el latido lo sabe por `senales`).
- Cuando Dani le escribe por WhatsApp desde la bandeja, en «Lo último de Dani» aparece «Te he escrito por WhatsApp: mira el móvil y contéstame por ahí» con su nombre y fecha. La app deja de quedarse muda.

## Qué cambia para Dani

- **Cola de WhatsApp** encima de la bandeja: todos los mensajes que las señales han preparado hoy, juntos; cada uno con Copiar, Abrir chat (`wa.me` con su teléfono del CRM y el texto) y Mandado (registra el contacto, calla la señal 3 días, deja el rastro en la app del atleta).
- **«Pausa o baja»**: con dos mensajes mandados en tres semanas y catorce días callado, la bandeja deja de pedirle que le escriba y propone decidir en el CRM («16 días callado tras 2 mensajes: ¿pausa o baja?»). Lo que no se decide se arrastra como «activo» durante meses.

## Cómo

- `home/VueltaCard.tsx` (`DIAS_PARA_VUELTA = 3`, lee `profile.senales`), estilos de `perdido` en `HomeScreen`.
- `challengeOptions.generateChallengeOptions`: `silencioDias` (≥ 7 → nivel de arranque → suave); el latido lo pasa desde `perfil.senales`.
- `bandejaDelDia`: señal `pausa_o_baja` (`DIAS_CALLADO_PARA_DECIDIR = 14`, `CONTACTOS_ANTES_DE_DECIDIR = 2`).
- `coach/ColaWhatsAppCard.tsx` en `HomeCoachScreen`; «Mandado» crea además `mensajesCoach` `wa_{email}_{fecha}`.
- Galería: pieza `vuelta`. Banco `/dev/bandeja` enseña la cola. Capturas `13a` (vuelta) y `13b` (cola).

## Pruebas

`tsc` 0 · `vitest` todo en verde (+3) · eslint e iconos OK.

## Hipótesis y métrica (4 semanas)

La culpa aleja; una vuelta amable con una tarea pequeña recupera. Métrica (A.2): atletas que vuelven a ≥ 3 registros/semana la semana siguiente a un contacto por silencio: ≥ 50 % de los contactados (medible por `contactos` + `senales`). Atletas «activos» callados > 14 días sin decisión: 7 hoy → 0.
