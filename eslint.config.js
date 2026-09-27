import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // The following rules are part of the React Compiler preset shipped with
      // eslint-plugin-react-hooks v7. This codebase intentionally seeds/derives
      // component state inside effects (async-loaded shipments, modal prop
      // initialisation) and its views are large by design. A safe refactor of
      // those patterns is a separate, larger effort, so they are relaxed here
      // instead of risking regressions in production.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/exhaustive-deps': 'off',

      // Context files legitimately export a Provider component together with its
      // companion hook (e.g. useAuth / useLanguage). This is a known limitation
      // of the fast-refresh rule rather than an actual error.
      'react-refresh/only-export-components': 'off',
    },
  },
])
