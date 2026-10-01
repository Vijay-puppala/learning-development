import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Builds everything into one JS chunk and one CSS file, which
 * scripts/build-artifact.mjs then inlines into a single HTML page. An artifact
 * page cannot fetch sibling assets reliably, so nothing may stay external.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-artifact',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    reportCompressedSize: false,
    rollupOptions: {
      input: 'src/artifact-main.tsx',
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
});
