// DNI/NIE y teléfono. Se valida en el cliente por CALIDAD DE DATO, no por
// seguridad: sirve para que un DNI mal tecleado no acabe siendo un duplicado
// fantasma en la importación, no para autenticar a nadie.

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** Mayúsculas, sin guiones, espacios ni puntos. Es la forma que se guarda. */
export function normalizarDni(dni?: string): string {
  return String(dni ?? '').toUpperCase().replace(/[\s.-]/g, '');
}

/**
 * Valida DNI (8 dígitos + letra) y NIE (X/Y/Z + 7 dígitos + letra) con el
 * dígito de control real, no solo el formato.
 */
export function esDniValido(dni?: string): boolean {
  const s = normalizarDni(dni);
  if (!s) return false;

  const dniMatch = s.match(/^(\d{8})([A-Z])$/);
  if (dniMatch) {
    return LETRAS_DNI[Number(dniMatch[1]) % 23] === dniMatch[2];
  }
  const nieMatch = s.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (nieMatch) {
    const prefijo = { X: '0', Y: '1', Z: '2' }[nieMatch[1] as 'X' | 'Y' | 'Z'];
    return LETRAS_DNI[Number(prefijo + nieMatch[2]) % 23] === nieMatch[3];
  }
  return false;
}

/** «12345678Z» → «12345678-Z». Solo para mostrar; nunca se guarda así. */
export function formatDni(dni?: string): string {
  const s = normalizarDni(dni);
  const m = s.match(/^([XYZ]?\d{7,8})([A-Z])$/);
  return m ? `${m[1]}-${m[2]}` : s;
}

// ── Teléfono ─────────────────────────────────────────────────────────────────

export const PREFIJOS_FRECUENTES = [
  { code: '+34', label: '🇪🇸 +34' },
  { code: '+351', label: '🇵🇹 +351' },
  { code: '+33', label: '🇫🇷 +33' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+52', label: '🇲🇽 +52' },
  { code: '+54', label: '🇦🇷 +54' },
  { code: '+56', label: '🇨🇱 +56' },
  { code: '+57', label: '🇨🇴 +57' },
  { code: '+1', label: '🇺🇸 +1' },
] as const;

export function normalizarPrefijo(prefijo?: string): string {
  const s = String(prefijo ?? '').replace(/[\s()-]/g, '');
  if (!s) return '';
  return s.startsWith('+') ? s : `+${s.replace(/^00/, '')}`;
}

export function normalizarNumero(numero?: string): string {
  return String(numero ?? '').replace(/[\s()-]/g, '');
}

export function formatTelefono(tel?: { prefijo: string; numero: string }): string {
  if (!tel?.numero) return '';
  return `${normalizarPrefijo(tel.prefijo)} ${tel.numero}`.trim();
}

/**
 * Enlace de WhatsApp. wa.me quiere el número SIN '+' y sin separadores.
 * Devuelve null si no hay número — así el llamante no pinta un enlace muerto.
 */
export function enlaceWhatsApp(tel?: { prefijo: string; numero: string }): string | null {
  const numero = normalizarNumero(tel?.numero);
  if (!numero) return null;
  const prefijo = normalizarPrefijo(tel?.prefijo).replace('+', '');
  return `https://wa.me/${prefijo}${numero}`;
}
