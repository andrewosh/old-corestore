const raw = require('random-access-web')
const DiscoverySwarmWeb = require('discovery-swarm-web')

const levelup = require('levelup')
const leveljs = require('level-js')

const storage = {
  create (path) {
    return nestStorage(raw('corestore'), path)
  },
  delete (path) {
    // Todo.
  }
}

function swarm (opts) {
  const swarm = new DiscoverySwarmWeb({
    ...opts,
    stream: opts.stream
  })
  return swarm
}

function level (path, opts) {
  return levelup(leveljs(path, opts))
}

module.exports = require('./index.js').withDefaults({ storage, swarm, level })

function nestStorage (storage, prefix) {
  return function (name, opts) {
    let path = [prefix, name].join('/')
    let ret = storage(path, opts)
    return ret
  }
}
