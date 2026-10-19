import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Strict CSP for production builds only (the dev server needs an inline preamble).
// No network access is needed: everything runs locally in the browser and the worker.
const CSP =
  "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta name="referrer"', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer"`),
  };
}

// BASE_PATH lets the same build deploy at a domain root ("/") or a sub-path such as
// GitHub Pages ("/mortgage-prepayment-lab/"). Routing is hash-based, so deep links
// survive a refresh on any static host without a server fallback.
// The exact commit and build time are shown in the footer and written to build.json, so a
// deployed preview can be matched to the commit that was tested.
const BUILD = { commit: process.env.BUILD_COMMIT ?? 'local', builtAt: new Date().toISOString() };

function buildInfoPlugin(): Plugin {
  return {
    name: 'build-info',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify(BUILD, null, 1) });
    },
  };
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), cspPlugin(), buildInfoPlugin()],
  define: { __BUILD_COMMIT__: JSON.stringify(BUILD.commit), __BUILD_TIME__: JSON.stringify(BUILD.builtAt) },
  worker: { format: 'es' },
  build: { sourcemap: true, target: 'es2022' },
});
