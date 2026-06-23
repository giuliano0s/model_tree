import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// assinatura do CONJUNTO de nós (ids do master EN). Muda só quando nós são
// adicionados/removidos — usada para invalidar o layout salvo apenas quando a
// estrutura muda, não a cada build.
function nodesSignature() {
  try {
    const tree = JSON.parse(
      fs.readFileSync(path.resolve(rootDir, 'data', 'models_tree.en.json'), 'utf-8'),
    )
    const ids = []
    const walk = (n) => { ids.push(n.id); (n.children ?? []).forEach(walk) }
    walk(tree)
    return crypto.createHash('sha1').update(ids.sort().join(',')).digest('hex').slice(0, 12)
  } catch {
    return 'dev'
  }
}

// Grava data/layout.json direto no disco via POST /__save-layout (só em dev)
function layoutSaver() {
  return {
    name: 'layout-saver',
    configureServer(server) {
      server.middlewares.use('/__save-layout', (req, res, next) => {
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

// id único por build: invalida o cache dos JSONs de dados a cada deploy (?v=)
const BUILD_ID = String(Date.now())
// assinatura dos nós: invalida o layout salvo só quando a estrutura muda
const NODES_ID = nodesSignature()

export default defineConfig({
  plugins: [react(), layoutSaver()],
  publicDir: 'data',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __NODES_ID__: JSON.stringify(NODES_ID),
  },
})
