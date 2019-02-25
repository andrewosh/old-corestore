const crypto = require('crypto')

const datEncoding = require('dat-encoding')
const hypercoreProtocol = require('hypercore-protocol')
const discoverySwarm = require('discovery-swarm')
const swarmDefaults = require('dat-swarm-defaults')
const mutexify = require('mutexify')

const log = require('debug')('corestore:network')

module.exports = Replicator

function Replicator (store, opts) {
  if (!(this instanceof Replicator)) return new Replicator(store, opts)
  opts = opts || {}
  this._opts = opts
  this._store = store

  this.id = opts.id || crypto.randomBytes(32)

  this._swarm = discoverySwarm(swarmDefaults({
    id: this.id,
    hash: false,
    utp: defaultTrue(opts.utp),
    tcp: defaultTrue(opts.tcp),
    dht: defaultTrue(opts.dht),
    stream: this._createReplicationStream.bind(this)
  }))
  this._swarm.listen(opts.port || 3005)

  this._replicatingCores = new Map()
  this._lock = mutexify()
}

// Lightly modified from Beaker's implementation
Replicator.prototype._createReplicationStream = function (info) {
  var self = this

  var streamKeys = [] // list of keys replicated over the stream
  var stream = hypercoreProtocol({
    id: this.id,
    live: true,
    encrypt: true
  })
  stream.peerInfo = info

  // add the archive if the discovery network gave us any info
  if (info.channel) {
    lockedAdd(info.channel)
  }

  // add any requested archives
  stream.on('feed', lockedAdd)

  function lockedAdd (dkey) {
    self._lock(release => {
      add(dkey)
        .then(() => release())
        .catch(err => release(err))
    })
  }

  async function add (dkey) {
    let keyString = datEncoding.toStr(dkey)
    // lookup the archive
    try {
      var core = self._replicatingCores.get(keyString)
      if (!core) core = await self._store._getSeedCore(dkey)
    } catch (err) {
      if (!stream.destroyed) stream.destroy(err)
    }

    self._replicatingCores.set(keyString, core)

    if (!core || !core.isSwarming) {
      return
    }

    if (!core.replicationStreams) {
      core.replicationStreams = []
    }
    if (core.replicationStreams.indexOf(stream) !== -1) {
      return // already replicating
    }

    // create the replication stream
    core.replicate({stream, live: true})
    if (stream.destroyed) return // in case the stream was destroyed during setup

    // track the stream
    var keyStr = datEncoding.toStr(core.key)
    streamKeys.push(keyStr)
    core.replicationStreams.push(stream)

    function onend () {
      core.replicationStreams = core.replicationStreams.filter(s => (s !== stream))
      // If the Replicator is the only object with a reference to this core, close it after replication's finished.
      if (!self._store._getCachedCore(core.key) && !core.replicationStreams.length) {
        self._replicatingCores.delete(keyString)
        core.close()
      }
    }
    stream.once('error', onend)
    stream.once('end', onend)
    stream.once('close', onend)
  }

  // debugging
  stream.on('error', err => {
    log(streamKeys, {
      event: 'connection-error',
      peer: `${info.host}:${info.port}`,
      connectionType: info.type,
      message: err.toString()
    })
  })
  return stream
}

Replicator.prototype.add = function (discoveryKey) {
  this._swarm.join(discoveryKey)
}

Replicator.prototype.remove = function (core) {
  if (core.replicationStreams) {
    core.replicationStreams.forEach(stream => stream.destroy()) // stop all active replications
    core.replicationStreams.length = 0
  }
  this._swarm.leave(core.discoveryKey)
}

Replicator.prototype.stop = async function (cb) {
  return new Promise((resolve, reject) => {
    this._swarm.destroy(err => {
      if (err) return reject(err)
      return resolve()
    })
  })
}

function defaultTrue (x) {
  return x === undefined ? true : x
}
