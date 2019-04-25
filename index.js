const p = require('path')

const sub = require('subleveldown')
const prefixer = require('sublevel-prefixer')
const crypto = require('hypercore/lib/crypto')
const hypercore = require('hypercore')
const datEncoding = require('dat-encoding')
const messages = require('./lib/messages.js')
const Replicator = require('./lib/replicator.js')

const KEY_PREFIX = 'key'
const DKEY_PREFIX = 'dkey'
const NAME_PREFIX = 'name'
const prefix = prefixer()

function defaultFactory (path, key, opts) {
  return hypercore(opts.storage(path), key, opts)
}

module.exports = Corestore

Corestore.withDefaults = function (defaultOpts) {
  return function (dir, opts) {
    return Corestore(dir, { ...defaultOpts, ...opts })
  }
}

function Corestore (dir, opts = {}) {
  if (typeof dir === 'object') return Corestore(null, dir)
  if (!(this instanceof Corestore)) return new Corestore(dir, opts)
  this._opts = opts

  this.dir = dir
  this._root = p.join(dir, 'cores')
  this._opened = false

  if (!opts.level) throw new Error('level is required')
  this.level = opts.level

  // Default: hypercore
  this.factory = opts.factory || defaultFactory

  // Default: random-access-file
  if (!opts.storage) throw new Error('storage is required')
  this._storageHandlers = wrapStorage(opts.storage)
  this.storage = this._storageHandlers.create

  // Default: discovery-swarm replicator
  if (!(opts.network && opts.network.disable)) {
    if (!opts.swarm) throw new Error('swarm is required if network is not disabled')
    this._replicator = Replicator(this, opts.swarm, opts.network)
  } else {
    this._noNetwork = true
  }

  // Set in ready.
  this._metadata = null
  this._metadataByDKey = null
  this._metadataByName = null
  this._metadataByKey = null

  this.coresByKey = new Map()
  this.coresByDKey = new Map()

  this._ready = new Promise(async (resolve, reject) => {
    if (this._storageHandlers.prepare) {
      await this._storageHandlers.prepare(dir)
    }

    this._metadata = this.level(p.join(dir, 'metadata'), {
      keyEncoding: 'utf8',
      valueEncoding: 'binary'
    })
    this._metadataByName = sub(this._metadata, NAME_PREFIX, { valueEncoding: 'utf8' })
    this._metadataByDKey = sub(this._metadata, DKEY_PREFIX, { valueEncoding: 'utf8' })
    this._metadataByKey = sub(this._metadata, KEY_PREFIX, { valueEncoding: 'binary' })

    try {
      if (!(opts.network && opts.network.disable)) {
        await this._seedAllCores()
      }
    } catch (err) {
      return reject(err)
    }
    this._opened = true
    return resolve()
  })

  this.ready = cb => {
    if (!cb) return this._ready
    this._ready.then(() => {
      return cb()
    }).catch(err => {
      return cb(err)
    })
  }
}

Corestore.prototype._path = function (key) {
  return p.join(this._root, key)
}

Corestore.prototype._cacheCore = function (core) {
  this.coresByKey.set(ensureString(core.key), core)
  this.coresByDKey.set(ensureString(core.discoveryKey), core)
}

Corestore.prototype._removeCachedCore = function (core) {
  this.coresByKey.delete(ensureString(core.key))
  this.coresByDKey.delete(ensureString(core.discoveryKey))
}

Corestore.prototype._getCachedCore = function (key) {
  let keyString = ensureString(key)
  return this.coresByKey.get(keyString)
}

Corestore.prototype._seedAllCores = async function () {
  return new Promise((resolve, reject) => {
    let stream = this._metadataByKey.createReadStream()
    stream.on('error', err => reject(err))
    stream.on('end', () => resolve())
    stream.on('data', ({ value }) => {
      try {
        let info = messages.Core.decode(value)
        if (info.seed) {
          this._replicator.add(info.discoveryKey)
        }
      } catch (err) {
        return reject(err)
      }
    })
  })
}

Corestore.prototype._create = function (key, opts = {}) {
  let keyString = ensureString(key)

  // Assign global storage by default.
  opts.storage = opts.storage || this.storage

  let core = this.factory(this._path(keyString), key, opts)

  core.on('close', () => {
    this._removeCachedCore(core)
    this._unseed(core)
  })

  let ready = core.ready.bind(core)
  let promise = new Promise((resolve, reject) => {
    ready(err => {
      if (err) return reject(err)

      let dKey = ensureString(core.discoveryKey)
      let key = ensureString(core.key)
      this._cacheCore(core)

      opts.key = core.key
      opts.discoveryKey = core.discoveryKey
      let info = messages.Core.encode(opts)

      let batch = [
        { type: 'put', key: prefix(KEY_PREFIX, key), value: info },
        { type: 'put', key: prefix(DKEY_PREFIX, dKey), value: key }
      ]
      if (opts.name) batch.push({ type: 'put', key: prefix(NAME_PREFIX, opts.name), value: key })

      this._metadata.batch(batch, err => {
        if (err) return reject(err)
        if (opts.seed) {
          this._seed(core)
        }
        return resolve()
      })
    })
  })

  core.ready = (cb) => {
    return promise
      .then(() => {
        if (cb) return cb()
      }).catch(err => {
        if (cb) return cb(err)
      })
  }

  return core
}

Corestore.prototype._seed = function (core) {
  if (!this._noNetwork) {
    this._replicator.add(core.discoveryKey)
    core.isSwarming = true
  }
}

Corestore.prototype._unseed = function (core) {
  if (!this._noNetwork) {
    this._replicator.remove(core)
    core.isSwarming = false
  }
}

Corestore.prototype._getSeedCore = async function (dKey, opts) {
  let info = await this.info(ensureString(dKey), { dkey: true })
  if (!info) return null
  if (!info.seed) return null

  let core = this._getCachedCore(info.key)
  if (core) return core

  core = this.get(info.key, opts)
  await core.ready()
  return core
}

Corestore.prototype.info = async function (key, opts = {}) {
  try {
    if (opts.name) {
      key = await this._metadataByName.get(key)
    } else if (opts.dkey) {
      key = ensureString(key)
      key = await this._metadataByDKey.get(key)
    } else {
      key = ensureString(key)
    }
    let value = await this._metadataByKey.get(key)
    return messages.Core.decode(value)
  } catch (err) {
    if (err.notFound) return null
    throw err
  }
}

Corestore.prototype.get = function (key, opts) {
  if (typeof key === 'object' && !(key instanceof Buffer)) {
    opts = key
    key = null
  }
  opts = opts || {}
  opts.seed = opts.seed !== undefined ? opts.seed : true
  opts.sparse = opts.sparse !== undefined ? opts.sparse : true
  if (!key) opts.valueEncoding = opts.valueEncoding || 'binary'

  if (key) {
    let existing = this._getCachedCore(key)
    if (existing) return existing
  } else {
    let { publicKey, secretKey } = opts.keyPair || crypto.keyPair()
    opts.secretKey = secretKey
    opts.writable = true
    key = publicKey
  }

  let core = this._create(key, opts)

  opts.writable = core.writable

  return core
}

Corestore.prototype.getByName = async function (name, opts) {
  let info = await this.info(name, { name: true })
  if (!info) return null

  let core = this.get(info.key, opts)
  await core.ready()
  return core
}

Corestore.prototype.update = async function (key, opts) {
  let keyString = ensureString(key)
  let info = await this.info(key)

  if (!info) throw new Error('Cannot update a nonexistent core.')
  let core = await this.get(key)

  if (opts.seed !== undefined && !opts.seed) {
    await this._unseed(core)
  }

  Object.assign(info, opts)

  this._metadataByKey.put(keyString, messages.Core.encode(info))
}

Corestore.prototype.delete = async function (key) {
  key = ensureString(key)
  let info = await this.info(key)

  if (!info) throw new Error('Cannot delete a nonexistent core')
  let core = this.get(key)

  if (info.seed && !this._noNetwork) {
    await this._unseed(core)
  }

  return new Promise(async (resolve, reject) => {
    core.close(async err => {
      if (err) return reject(err)

      try {
        // TODO: Delete discovery key pointers too.
        let batch = [
          { type: 'del', key: prefix(KEY_PREFIX, key) }
        ]
        if (info.name) batch.push({ type: 'del', key: prefix(NAME_PREFIX, info.name) })
        await this._metadata.batch(batch)

        if (this._storageHandlers.delete) {
          await this._storageHandlers.delete(this._path(key))
        }

        this._removeCachedCore(core)

        return resolve()
      } catch (err) {
        return reject(err)
      }
    })
  })
}

Corestore.prototype.list = async function () {
  return new Promise((resolve, reject) => {
    let result = new Map()
    let stream = this._metadataByKey.createReadStream()
    stream.on('data', ({ key, value }) => {
      result.set(key, messages.Core.decode(value))
    })
    stream.on('end', () => {
      return resolve(result)
    })
    stream.on('error', err => {
      return reject(err)
    })
  })
}

Corestore.prototype.close = async function () {
  let self = this
  if (!this._opened) return
  let tasks = [self._metadata.close()]
  if (self._replicator) tasks.push(self._replicator.stop())
  return Promise.all(tasks)
}

function ensureString (key) {
  return datEncoding.toStr(key)
}

function wrapStorage (storage) {
  if (typeof storage === 'object') return storage
  if (typeof storage === 'function') return { create: storage }
  throw new Error('Storage should be a function or a string.')
}
