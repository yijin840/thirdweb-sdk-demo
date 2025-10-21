import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        outDir: 'public/dist',
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(__dirname, 'frontend/main.ts'),
            output: {
                entryFileNames: 'bundle.js',
                format: 'es',
            },
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'frontend'),
        },
    },
});