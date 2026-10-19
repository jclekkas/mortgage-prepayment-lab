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
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), cspPlugin()],
  worker: { format: 'es' },
  build: { sourcemap: true, target: 'es2022' },
});
