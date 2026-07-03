import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const refreshScript = resolve(here, '..', 'scripts', 'refresh.sh')

// Dev-server endpoint the dashboard's "Refresh" button calls.
// POST /api/refresh -> re-runs scripts/pull_v2.py and rewrites public/substrate.json.
function substrateRefresh() {
  let running = false
  return {
    name: 'substrate-refresh',
    configureServer(server) {
      server.middlewares.use('/api/refresh', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end(JSON.stringify({ error: 'POST only' }))
        }
        if (running) {
          res.statusCode = 409
          return res.end(JSON.stringify({ error: 'A refresh is already in progress' }))
        }
        running = true
        // Optional ?days=N -> re-pull for that lookback window (validated 1..365).
        const days = Number(new URL(req.url, 'http://x').searchParams.get('days'))
        const env = { ...process.env }
        if (Number.isFinite(days) && days >= 1 && days <= 365) env.PULL_DAYS = String(Math.round(days))
        execFile('/bin/bash', [refreshScript], { timeout: 5 * 60 * 1000, env }, (err, stdout, stderr) => {
          running = false
          if (err) {
            res.statusCode = 500
            return res.end(JSON.stringify({ ok: false, error: String(err.message || err), stderr: stderr?.slice(-600) }))
          }
          res.end(JSON.stringify({ ok: true, log: (stdout || '').slice(-600) }))
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), substrateRefresh()],
  server: { host: true },
})
