const p = require('path')
const fs = require('fs-extra')
const encode = require('encoding-down')
const levelup = require('levelup')
const memdown = require('memdown')

const Store = require('../..')

const TEST_DIR = p.join(__dirname, '..', 'test-storage')

module.exports = {
  cleanup,
  create,
  append,
  get,
  close,
  levelmem
}

function levelmem (path, opts) {
  // TODO: If using valueEncoding: 'utf-8' as is passed in opts,
  // it does not work.
  return levelup(encode(memdown(), {
    valueEncoding: 'binary',
    keyEncoding: 'binary'
  }))
}

async function cleanup () {
  for (var i = 0; i < arguments.length; i++) {
    let store = arguments[i]
    await store.close()
    await fs.remove(store.dir)
  }
}

async function create (idx, opts) {
  opts = {
    network: { port: 4000 + idx },
    ...opts
  }
  let store = Store(p.join(opts.dir || TEST_DIR, `s${idx}`), opts)
  await store.ready()
  return store
}

async function append (core, val) {
  return new Promise((resolve, reject) => {
    core.append(val, err => {
      if (err) return reject(err)
      return resolve()
    })
  })
}

async function get (core, idx) {
  return new Promise((resolve, reject) => {
    core.get(idx, (err, value) => {
      if (err) return reject(err)
      return resolve(value)
    })
  })
}

async function close (core) {
  return new Promise((resolve, reject) => {
    core.close(err => {
      if (err) return reject(err)
      return resolve()
    })
  })
}
