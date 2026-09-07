import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

// tsc --noEmit ya cubre tipos; este config añade lo que tsc no ve: hooks mal
// usados (deps de useEffect, hooks condicionales) y variables/imports muertos.
export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    linterOptions: {
      // Varios `// eslint-disable ... no-explicit-any` quedaron de cuando esa
      // regla estaba activa en otro entorno; no vale la pena limpiarlos uno a
      // uno solo para silenciar este meta-aviso.
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      // Solo las dos reglas clásicas de hooks (bugs reales: hooks condicionales,
      // deps de effect incompletas). El resto del preset "recommended" de v7 son
      // reglas orientadas al React Compiler (set-state-in-effect, purity,
      // static-components...) que disparan sobre el patrón de carga de datos
      // establecido en toda la app (useEffect -> fetch -> setState) — sería
      // ruido, no señal, en este codebase.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'off', // varios archivos exportan tipos/const junto al componente a propósito
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off', // preexistente en el codebase; no forzar una migración masiva aquí
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }], // patrón deliberado: fallback silencioso a localStorage

      // ── Accesibilidad ────────────────────────────────────────────────────
      // El preset `recommended` de jsx-a11y entero, pero como AVISO, no como
      // error. Motivo: se añade sobre un codebase ya escrito, y convertir de
      // golpe en error 34 reglas sobre 100+ pantallas pararía `lint:eslint`
      // por deuda vieja en vez de por lo que se esté tocando. Como aviso,
      // cada pantalla que se toca se puede dejar limpia sin bloquear al resto.
      //
      // El plugin declara compatibilidad hasta ESLint 9 y aquí vamos por la
      // 10; el `override` de package.json apunta su peer al eslint de la raíz
      // SOLO para él. La alternativa (--legacy-peer-deps) apaga la
      // instalación de peers en TODO el árbol y se llevó por delante
      // `react-is`, que recharts necesita para las gráficas. Revisar cuando
      // el plugin publique soporte de ESLint 10.
      // Se respeta lo que el preset apaga a propósito (`label-has-for` está
      // obsoleta y la sustituye `label-has-associated-control`;
      // `control-has-associated-label` duplica a las demás y el propio
      // plugin la deja fuera): solo se rebaja de error a aviso lo que SÍ
      // trae encendido.
      ...Object.fromEntries(
        Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([regla, nivel]) => {
          const severidad = Array.isArray(nivel) ? nivel[0] : nivel;
          const apagada = severidad === 'off' || severidad === 0;
          return [regla, apagada ? 'off' : (Array.isArray(nivel) ? ['warn', ...nivel.slice(1)] : 'warn')];
        }),
      ),
      // Excepción razonada: `autoFocus` aquí NO es el que critica la regla.
      // La regla protege del campo que roba el foco al CARGAR una página; los
      // 13 usos de la app son editores que aparecen porque el usuario acaba de
      // pulsar «editar» o de abrir un sheet, y llevar el foco al campo recién
      // abierto es justo lo que espera quien navega con teclado o lector de
      // pantalla. Quitarlos empeoraría la accesibilidad, no al revés.
      'jsx-a11y/no-autofocus': 'off',
    },
  },
);
