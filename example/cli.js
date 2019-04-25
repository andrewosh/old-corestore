// const store = require('../node')
// const http = require('http')
// const fs = require('fs')
// const DiscoverySwarmWebServer = require('discovery-swarm-web/server')

// let port = 8080

// const server = http.createServer((req, res) => {
//   console.log(req)
//   res.writeHead(200, {
//     'Content-Type': 'text/html'
//   })
//   if (req.url === '/bundle.js') {
//     res.end(fs.readFileSync('./bundle.js'))
//   }
//   res.end(fs.readFileSync('./index.html'))
// })

// DiscoverySwarmWebServer.createServer({
//   server
// })

// server.listen(port)

const Corestore = require('../node')
const factory = require('./factory')
const network = { dht: false, tcp: false }
// const network = {}
const store = Corestore('./.data', { factory, network })
const debug = require('debug')('cli')

start(store)

async function start (store) {
  await store.ready()
  logStore(store)
  let key = process.argv[2]
  if (key === 'new') key = undefined
  const path = process.argv[3]
  const data = process.argv[4]
  const drive = await store.get(key, { type: 'hyperdrive', sparse: false })
  await drive.ready()
  console.log(`${key ? 'OLD' : 'NEW'}: ${drive.key.toString('hex')}`)
  console.log('INFO', await store.info(drive.key))

  if (data) await write(path, data)
  if (path) await read(path)

  function write (path, data) {
    return new Promise((resolve) => {
      drive.writeFile(path, Buffer.from(data), (err) => {
        if (err) console.log(`write ${path}: error`, err.message)
        else console.log(`write ${path}: ok | ${data}`)
        resolve()
      })
    })
  }

  function read (path) {
    return new Promise((resolve) => {
      drive.readFile(path, (err, data) => {
        if (err) console.log(` read ${path}: err | ${err.message}`)
        else console.log(`read ${path}: ok | ${data.toString()}`)
        resolve()
      })
    })
  }
}

function logStore (store) {
  const swarm = store._replicator._swarm
  const _emit = swarm.emit
  swarm.emit = (...args) => {
    debug('swarm emit', args[0])
    _emit.apply(swarm, args)
  }
}
