// Default handlers.
const raf = require('random-access-file')
const mkdirp = require('mkdirp')
const fs = require('fs-extra')
const discoverySwarm = require('discovery-swarm')
const swarmDefaults = require('dat-swarm-defaults')
const p = require('path')
const level = require('level')

const storage = {
  create (path) {
    return nestStorage(raf, path)
  },
  prepare (path) {
    return new Promise((resolve, reject) => {
      mkdirp(path, err => err ? reject(err) : resolve())
    })
  },
  delete (path) {
    return fs.remove(path)
  }
}

function swarm (opts) {
  const swarm = discoverySwarm(swarmDefaults({
    id: opts.id,
    hash: false,
    utp: defaultTrue(opts.utp),
    tcp: defaultTrue(opts.tcp),
    dht: defaultTrue(opts.dht),
    stream: opts.stream
  }))
  swarm.listen(opts.port || 3005)
  return swarm
}

module.exports = require('./index.js').withDefaults({ storage, swarm, level })

function defaultTrue (x) {
  return x === undefined ? true : x
}

function nestStorage (storage, ...prefixes) {
  return function (name, opts) {
    let path = p.join(...prefixes, name)
    let ret = storage(path, opts)
    return ret
  }
}
