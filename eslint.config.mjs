import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import reactHooks from 'eslint-plugin-react-hooks'

// Next 16 removed the `next lint` command; `pnpm lint` now runs the ESLint CLI
// (`eslint .`) against this flat config. `eslint-config-next` v16 ships a native
// flat config, so we spread it directly (no @eslint/eslintrc FlatCompat shim —
// that shim mis-parses the flat array and crashes). `core-web-vitals` is the same
// preset `next lint` used by default; it already registers the global ignores
// (.next, out, build, next-env.d.ts) on top of the default node_modules/.git.
const eslintConfig = [
  ...nextCoreWebVitals,
  {
    // `eslint-config-next@16` bundles `eslint-plugin-react-hooks@7`, which ships a
    // batch of new lint rules the old `next lint` (react-hooks v4/v5) never enforced.
    // They flag ~51 pre-existing patterns across the admin/cms surface — mostly
    // benign fetch-into-state effects — so refactoring them all on a live site is
    // high-risk, low-reward. We keep them as `warn` (visible tech-debt to burn down)
    // instead of `error`, so the CI lint gate can enforce genuine violations
    // (rules-of-hooks, unescaped entities, page-nav links, new bugs) without blocking
    // on this backlog. Downgrade — do not disable — so new occurrences stay visible.
    //
    // Flat config requires the plugin to be registered in the same config object as
    // the rule override, so we re-register the same `eslint-plugin-react-hooks` that
    // `eslint-config-next` already uses (identical instance → no plugin-redefinition
    // conflict).
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
]

export default eslintConfig
