import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Grava data/layout.json direto no disco via POST /api/save-layout (só em dev)
function layoutSaver() {
  return {
    name: 'layout-saver',
    configureServer(server) {
      server.middlewares.use('/api/save-layout', (req, res, next) => {
        if (req.method !== 'POST') return next()
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            JSON.parse(body) // valida antes de gravar
            const target = path.resolve(rootDir, 'data', 'layout.json')
            fs.writeFileSync(target, body)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(e) }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), layoutSaver()],
  publicDir: 'data',
})
