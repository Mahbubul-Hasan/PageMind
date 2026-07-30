import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import fs from 'fs';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        sidepanel: resolve(__dirname, 'src/sidepanel.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  plugins: [
    viteStaticCopy({
      targets: [{ src: 'manifest.json', dest: '.' }],
    }),
    {
      name: 'flatten-html',
      closeBundle() {
        const src = resolve(__dirname, 'dist/src/sidepanel.html');
        const dest = resolve(__dirname, 'dist/sidepanel.html');
        if (fs.existsSync(src)) {
          fs.renameSync(src, dest);
          try { fs.rmdirSync(resolve(__dirname, 'dist/src')); } catch { /* ignore */ }
        }
      },
    },
  ],
});
