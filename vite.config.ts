import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Filesystem is the source of truth. No user-maintained manifest is needed.
function modelsPlugin(): Plugin {
  const root = path.resolve('assets/models');
  const scan = (dir = root): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? scan(path.join(dir, entry.name)) : /\.glb$/i.test(entry.name) ? [path.relative(root, path.join(dir, entry.name)).replaceAll('\\', '/')] : []);
  return {
    name: 'previs-models',
    resolveId(id) { if (id === 'virtual:models') return '\0virtual:models'; },
    load(id) {
      if (id !== '\0virtual:models') return;
      const models = scan().sort().map(asset => {
        const name = path.basename(asset).replace(/\.glb$/i, '').replace(/[_-]/g, ' ').replace(/\b\w/g, s => s.toUpperCase());
        if (this.meta.watchMode) return { asset, name, url: `/assets/models/${asset.split('/').map(encodeURIComponent).join('/')}` };
        const ref = this.emitFile({ type: 'asset', name: asset, source: readFileSync(path.join(root, asset)) });
        return { asset, name, ref };
      });
      return 'export default [' + models.map(m => 'ref' in m
        ? `{asset:${JSON.stringify(m.asset)},name:${JSON.stringify(m.name)},url:import.meta.ROLLUP_FILE_URL_${m.ref}}`
        : JSON.stringify(m)).join(',') + ']';
    },
    configureServer(server) {
      server.watcher.add(root);
      const reload = (file: string) => { if (file.startsWith(root) && /\.glb$/i.test(file)) {
        const mod = server.moduleGraph.getModuleById('\0virtual:models');
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      } };
      server.watcher.on('add', reload).on('unlink', reload);
    },
  };
}
export default defineConfig({ plugins: [react(), modelsPlugin()], base: './', build: { chunkSizeWarningLimit: 1000 } });
