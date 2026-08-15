import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const legacyGlobals = {
  AnimatedIcon: 'readonly',
  AskHuveSheet: 'readonly',
  Badge: 'readonly',
  Button: 'readonly',
  Card: 'readonly',
  Checkbox: 'readonly',
  Confetti: 'readonly',
  Dashboard: 'readonly',
  EmptyState: 'readonly',
  MapControls: 'readonly',
  MapLibreMap: 'readonly',
  MapMarker: 'readonly',
  MemoryPhotoGrid: 'readonly',
  Modal: 'readonly',
  ModulePage: 'readonly',
  NotesJournalScreen: 'readonly',
  Onboarding: 'readonly',
  Pill: 'readonly',
  PrivateMemoryPhotoGrid: 'readonly',
  PrivatePhoto: 'readonly',
  ProgressBar: 'readonly',
  React: 'readonly',
  SEED: 'readonly',
  SectionHeader: 'readonly',
  Sheet: 'readonly',
  SpinningGlobe: 'readonly',
  TweakColor: 'readonly',
  TweakRadio: 'readonly',
  TweakSection: 'readonly',
  TweakToggle: 'readonly',
  TweaksPanel: 'readonly',
  applyProgress: 'readonly',
  askHuve: 'readonly',
  daysUntil: 'readonly',
  moduleProgress: 'readonly',
  uid: 'readonly',
  useTweaks: 'readonly',
}

export default defineConfig([
  globalIgnores(['dist', 'ios', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['**/*.jsx'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      globals: { ...globals.browser, ...legacyGlobals },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    // These React Compiler diagnostics were added to the plugin's flat
    // preset after the legacy screens were written. Phase 0 intentionally
    // widens classic ESLint + Rules of Hooks coverage without rewriting the
    // rendering architecture (or the protected call and games screens).
    rules: {
      'react-hooks/static-components': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/unsupported-syntax': 'off',
      'react-hooks/config': 'off',
      'react-hooks/gating': 'off',
    },
  },
  {
    files: ['app.jsx'],
    // App handles guest routes before booting the authenticated shell. The
    // early route returns predate Hooks linting and require a dedicated route
    // wrapper refactor; keep this one explicit exception visible in CI.
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    files: ['games.jsx'],
    // The execution brief explicitly protects the games implementation from
    // edits. Preserve that boundary while still linting it for every other
    // rule and reporting its existing Hooks warning.
    rules: { 'no-unused-vars': 'off' },
  },
])
