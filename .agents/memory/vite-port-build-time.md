---
name: Vite config must tolerate missing PORT at build time
description: Why vite.config.ts throwing on an unset PORT breaks production builds, and the fix.
---

# PORT in vite.config.ts

**Rule:** `vite.config.ts` runs during `vite build`, but `PORT` is only injected at **runtime** (dev/serve), not during the production build. If the config does `if (!process.env.PORT) throw`, the production build fails even though dev works. Use a fallback: `const rawPort = process.env.PORT ?? "<default>";` and keep only the `Number.isNaN(port) || port <= 0` validation.

**Why:** `port` is used to configure the dev server; the built static assets don't need it. Throwing makes build-time depend on a runtime-only variable.

**How to apply:** When one frontend fails its production build with "PORT environment variable is required" while sibling frontends build fine, compare configs — the working ones use a `?? default` fallback. Match that pattern.
