import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

/*
 * Flat config directly, not through FlatCompat. The compat bridge throws a
 * circular-structure error on eslint-config-next under ESLint 10, and
 * eslint-config-next already ships flat-config exports.
 */
const config = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: ['.next/**', 'node_modules/**', 'supabase/**', 'public/sw.js'],
  },
]

export default config
