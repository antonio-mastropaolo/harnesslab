import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
const here = path.resolve('test')
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^\.\.\/App$/, replacement: path.join(here, 'stubs/App.jsx') },
      { find: /^\.\.\/api$/, replacement: path.join(here, 'stubs/api.js') },
    ],
  },
  build: {
    lib: { entry: 'test/entry.jsx', formats: ['iife'], name: 'T', fileName: () => 'bundle.js' },
    outDir: 'test/out', emptyOutDir: false, minify: false,
  },
})
