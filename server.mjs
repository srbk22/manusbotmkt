import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('./dist', import.meta.url))
const port = Number(process.env.PORT || 3000)

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
