import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {configDefaults} from "vitest/config";
/// <reference types="vitest/config" />
import sendPdfHandler from '../api/send-pdf.js'

function devSendPdfApi() {
  return {
    name: 'dev-send-pdf-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? ''
        if (pathname !== '/api/send-pdf') {
          return next()
        }
        try {
          await sendPdfHandler(req, res)
        } catch (err) {
          console.error('[dev-send-pdf-api]', err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }))
          }
        }
      })
    },
  }
}


export default defineConfig({
  plugins: [react(), devSendPdfApi()],
  test: {
    include: ['**/__tests__/**/*.{test,spec}.{js,jsx}'],
    exclude: [...configDefaults.exclude, 'packages/template/*'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        '**/__tests__/**',
        'src/main.jsx',
        'src/supabaseClient.js',
      ],
    },
  },
})
