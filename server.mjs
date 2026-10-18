import { createServer } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('./dist', import.meta.url))
const port = Number(process.env.PORT || 3000)
const UPSTREAM = 'https://manusbot.up.railway.app'

function allowedProxy(url) {
  const path = url.split('?')[0]
  if (path.startsWith('/api/bot')) return false
  return (
    path === '/api/session'
    || path.startsWith('/api/auth/')
    || path === '/api/sdk/balances'
    || path.startsWith('/api/sdk/actives')
    || path.startsWith('/api/chart/')
    || path === '/api/user'
    || path === '/api/user/email'
    || path === '/api/embed-origin'
    || path === '/api/version'
    || path === '/auth/launch'
    || path === '/auth/callback'
  )
}

function proxyUpstream(req, res) {
  const target = new URL(req.url, UPSTREAM)
  const headers = {
    accept: req.headers.accept || '*/*',
    cookie: req.headers.cookie || '',
  }
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']
  const upstream = httpsRequest(target, { method: req.method, headers }, (up) => {
    const out = { ...up.headers }
    delete out['content-length']
    delete out['content-encoding']
    if (out['set-cookie']) {
      const cookies = Array.isArray(out['set-cookie']) ? out['set-cookie'] : [out['set-cookie']]
      out['set-cookie'] = cookies.map(cookie => String(cookie).replace(/;\s*Domain=[^;]*/ig, ''))
    }
    res.writeHead(up.statusCode || 502, out)
    up.pipe(res)
  })
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
  req.pipe(upstream)
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const path = normalize(join(root, decoded))
  if (!path.startsWith(root)) return null
  return path
}

const server = createServer(async (req, res) => {
  if (req.url?.startsWith('/api/health')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'manusbotmkt' }))
    return
  }

  if (req.url && allowedProxy(req.url)) {
    proxyUpstream(req, res)
    return
  }

  if (req.url?.split('?')[0].startsWith('/api/bot')) {
    res.writeHead(403, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Não foi possível iniciar o bot.' }))
    return
  }

  const requested = safePath(req.url || '/')
  if (!requested) {
    res.writeHead(400)
    res.end()
    return
  }

  let file = requested
  try {
    const info = await stat(file)
    if (info.isDirectory()) file = join(file, 'index.html')
    const data = await readFile(file)
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    try {
      const data = await readFile(join(root, 'index.html'))
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(data)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`manusbotmkt listening on ${port}`)
})
