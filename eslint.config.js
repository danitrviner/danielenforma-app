import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
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
    },
  },
);
