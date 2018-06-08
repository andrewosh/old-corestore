const p = require('path')
const test = require('tape')
const fs = require('fs-extra')
const mkdirp = require('mkdirp')

const Store = require('..')

const TEST_DIR = p.join(__dirname, 'test-storage')

test('setup', t => {
  mkdirp(TEST_DIR)
  t.end()
})

test('can create and get info for a core', async t => {
  let s = create()
  await s.ready
  let core = await s.get()
  let info = await s.info(core.key)
  t.same(core.sparse, info.sparse)
  t.same(core.writable, info.writable)

  await cleanup(s)
  t.end()
})

test('can create and get info for a core, across restarts', async t => {
  let s = create()
  await s.ready
  let core = await s.get()
  await s.close()

  s = create()
  await s.ready
  core = await s.get()
  let info = await s.info(core.key)
  t.same(core.sparse, info.sparse)
  t.same(core.writable, info.writable)

  await s.close()
  t.end()
})

test.skip('can create and replicate a core', t => {
})

test.skip('should not seed if seed is false', t => {
})

test.skip('should stop seeding', t => {
})

test('teardown', t => {
  fs.remove(TEST_DIR)
  t.end()
})

let idx = 0
async function cleanup () {
  for (var i = 0; i < arguments.length; i++) {
    let store = arguments[i]
    await store.close()
    await fs.remove(store.dir)
  }
}

function create () {
  return Store(p.join(TEST_DIR, `s${idx}`), { network: { port: 4000 + idx++ } })
}
