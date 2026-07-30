import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'PageMindContent',
      fileName: () => 'content.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: false,
  },
});
