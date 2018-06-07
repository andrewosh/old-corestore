const p = require('path')

const fs = require('fs-extra')
const level = require('level')
const hypercore = require('hypercore')
const crypto = require('hypercore/lib/crypto')
const datEncoding = require('dat-encoding')

const Replicator = require('./lib/replicator.js')
const messages = require('./messages.js')

module.exports = Corestore

function Corestore (dir, opts) {
  if (!(this instanceof Corestore)) return new Corestore(dir, opts)
  opts = opts || {}
  this._opts = opts

  this._metadata = level(p.join(dir, 'metadata'))
  this._root = p.join(dir, 'cores')
  this._replicator = Replicator(this, opts.network)

  // Set in _load.
  this.coresByKey = {}
  this.coresByDKey = {}

  this.ready = new Promise((resolve, reject) => {
    this._load(err => {
      if (err) return reject(err)
      return resolve()
    })
  })
}

Corestore.prototype._path = function (key) {
  return p.join(this._root, key)
}

Corestore.prototype._loadAll = async function (cb) {
  let cores = await this.list()
  let keys = Object.keys(cores)
  for (var i = 0; i < keys.length; i++) {
    let key = keys[i]
    let meta = this.coresByKey[key]
    await this._create(key, meta)
  }
}

Corestore.prototype._create = async function (key, opts) {
  var self = this

  let keyString = ensureString(key)
  let core = hypercore(this._path(keyString), key, opts)

  this._coresByKey[keyString] = core

  await new Promise((resolve, reject) => {
    core.ready(err => {
      if (err) return reject(err)
      self._coresByDKey[ensureString(core.discoveryKey)] = core
      return resolve(core)
    })
  })

  if (opts.seed) {
    await this._seed(core)
  }
}

Corestore.prototype._seed = async function (core) {

}

Corestore.prototype._unseed = async function (core) {

}

Corestore.prototype.info = async function (key) {
  key = ensureString(key)
  try {
    let value = await this._metadata.get(key)
    return messages.Core.decode(value)
  } catch (err) {
    if (err.notFound) return null
    throw err
  }
}

Corestore.prototype.get = async function (key, opts) {
  if (typeof key === 'object' && !(key instanceof Buffer)) {
    opts = key
    key = null
  }

  if (key) {
    let keyString = ensureString(key)
    let existing = this._coresByKey[keyString]
    if (existing) return existing
  } else {
    let { publicKey, privateKey } = crypto.keyPair()
    opts.privateKey = privateKey
    key = publicKey
  }

  let core = await this._create(key, opts)
  opts.writable = core.writable

  await this._metadata.put(ensureString(core.key), messages.Core.encode(opts))

  return core
}

Corestore.prototype.update = async function (key, opts) {

}

Corestore.prototype.delete = async function (key) {
  key = ensureString(key)
  let info = await this.info(key)

  if (!info) throw new Error('Cannot delete a nonexistent key')
  let core = this._cores[key]
  if (!core) throw new Error('Core was not initialized correctly')

  if (info.seed) {
    await this._unseed(core)
  }

  delete this._coresByKey[key]
  delete this._coresByDKey[ensureString(core.discoveryKey)]

  await fs.remove(this._path(key))
  return true
}

Corestore.prototype.list = async function (opts) {
  return new Promise((resolve, reject) => {
    let result = {}
    let stream = this._metadata.createReadStream()
    stream.on('data', ({ key, value }) => {
      result[key] = messages.Core.decode(value)
    })
    stream.on('end', () => {
      return resolve(result)
    })
    stream.on('error', err => {
      return reject(err)
    })
  })
}

function ensureString (key) {
  return datEncoding.toStr(key)
}
