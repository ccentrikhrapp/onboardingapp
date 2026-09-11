// SSR smoke test: render every route once and report crashes.
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';

// minimal localStorage shim
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const entry = `
import React from 'react';
import { AuthProvider } from './src/context/AuthContext.jsx';
import { AppProvider } from './src/context/AppContext.jsx';
import { ToastProvider } from './src/context/ToastContext.jsx';
import AppRoutes from './src/routes/AppRoutes.jsx';
export function Root() {
  return React.createElement(ToastProvider, null,
    React.createElement(AuthProvider, null,
      React.createElement(AppProvider, null,
        React.createElement(AppRoutes, null))));
}
`;
mkdirSync('scripts/.tmp', { recursive: true });
writeFileSync('_smoke_entry.jsx', entry);

const out = 'scripts/.tmp/bundle.mjs';
await build({
  entryPoints: ['_smoke_entry.jsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react-router-dom', 'lucide-react'],
  loader: { '.js': 'jsx', '.png': 'dataurl', '.jpg': 'dataurl', '.jpeg': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  logLevel: 'silent',
});

const { Root } = await import(pathToFileURL(process.cwd() + '/' + out).href);
const { StaticRouter: Router } = await import('react-router-dom/server.mjs');

// silence React's StaticRouter <Navigate> warning (fine under BrowserRouter)
const origErr = console.error;
console.error = (...a) => {
  if (String(a[0]).includes('<Navigate> must not be used on the initial render')) return;
  origErr(...a);
};

const routes = [
  '/login', '/ta/login', '/candidate', '/candidate/jobs', '/candidate/jobs/JOB-1024',
  '/candidate/apply', '/candidate/apply/JOB-1024', '/candidate/application', '/candidate/profile',
  '/ta', '/ta/candidates', '/ta/candidates/CAN-2026-000120',
  '/ta/jobs', '/ta/jobs/JOB-1024', '/ta/settings', '/ta/profile',
];

// No backend is configured in this harness, so /ta/* just redirects to
// login (no role) — still a valid crash check for routing + component wiring.
let fails = 0;
for (const path of routes) {
  try {
    renderToString(React.createElement(Router, { location: path }, React.createElement(Root)));
    console.log('  ok  ', path);
  } catch (e) {
    fails++;
    console.log('  FAIL', path, '::', e.message);
  }
}
rmSync('_smoke_entry.jsx', { force: true });
console.log(fails ? `\n${fails} route(s) failed` : '\nAll routes rendered without crashing');
process.exit(fails ? 1 : 0);
