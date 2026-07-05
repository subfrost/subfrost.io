import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

// Next 16 removed the `next lint` command; `pnpm lint` now runs the ESLint CLI
// (`eslint .`) against this flat config. `eslint-config-next` v16 ships a native
// flat config, so we spread it directly (no @eslint/eslintrc FlatCompat shim —
// that shim mis-parses the flat array and crashes). `core-web-vitals` is the same
// preset `next lint` used by default; it already registers the global ignores
// (.next, out, build, next-env.d.ts) on top of the default node_modules/.git.
const eslintConfig = [...nextCoreWebVitals]

export default eslintConfig
