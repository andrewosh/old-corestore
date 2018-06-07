const crypto = require('crypto')

const datEncoding = require('dat-encoding')
const hypercoreProtocol = require('hypercore-protocol')
const discoverySwarm = require('discovery-swarm')
const swarmDefaults = require('dat-swarm-defaults')

const log = require('debug')('corestore:network')

module.exports = Replicator

function Replicator (store, opts) {
  if (!(this instanceof Replicator)) return new Replicator(opts)
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
}

// Lightly modified from Beaker's implementation
Replicator.prototype._createReplicationStream = function (info) {
  var streamKeys = [] // list of keys replicated over the stream
  var stream = hypercoreProtocol({
    id: this.id,
    live: true,
    encrypt: true
  })
  stream.peerInfo = info

  // add the archive if the discovery network gave us any info
  if (info.channel) {
    add(info.channel)
  }

  // add any requested archives
  stream.on('feed', add)

  function add (dkey) {
    // lookup the archive
    var dkeyStr = datEncoding.toStr(dkey)
    var core = this.store.coresByDKey[dkeyStr]
    if (!core || !core.isSwarming) {
      return
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

// put the archive into the network, for upload and download
Replicator.prototype.add = function (core) {
  if (core.isSwarming) return

  this._swarm.join(core.discoveryKey)
  var keyStr = datEncoding.toStr(core.key)
  log(keyStr, {
    event: 'swarming',
    discoveryKey: datEncoding.toStr(core.discoveryKey)
  })
  core.isSwarming = true
}

// take the archive out of the network
Replicator.prototype.remove = function (core) {
  if (!core.isSwarming) return

  var keyStr = datEncoding.toStr(core.key)
  log(keyStr, {
    event: 'unswarming',
    message: `Disconnected ${core.peers.length} peers`
  })

  core.replicationStreams.forEach(stream => stream.destroy()) // stop all active replications
  core.replicationStreams.length = 0
  this._swarm.leave(core.discoveryKey)
  core.isSwarming = false
}

function defaultTrue (x) {
  return x === undefined ? true : x
}
