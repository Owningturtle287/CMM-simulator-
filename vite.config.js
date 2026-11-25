import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

function offline() {
  const publicDir = fileURLToPath(new URL('./public', import.meta.url));
  const templatePath = new URL('./src/offline.js', import.meta.url);
  return {
    name: 'accura-offline',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const assets = readdirSync(publicDir, { recursive: true, withFileTypes: true })
          .filter(entry => entry.isFile())
          .map(entry => join(entry.parentPath, entry.name).slice(publicDir.length + 1));
        const files = [...new Set(['index.html', ...Object.keys(bundle), ...assets])].sort();
        const template = readFileSync(templatePath, 'utf8');
        const hash = createHash('sha256').update(template).update(JSON.stringify(files));
        for (const asset of assets) hash.update(readFileSync(join(publicDir, asset)));
        this.emitFile({
          type: 'asset', fileName: 'sw.js',
          source: template.replace('__BUILD_ID__', hash.digest('hex').slice(0, 12))
            .replace('__BUILD_FILES__', JSON.stringify(files.map(file => `./${file}`))),
        });
      },
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [offline()],
  build: {
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
    chunkSizeWarningLimit: 650,
  },
});
