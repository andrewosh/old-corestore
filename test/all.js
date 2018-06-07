const p = require('path')
const test = require('tape')
const fs = require('fs-extra')
const mkdirp = require('mkdirp')
const datEncoding = require('dat-encoding')

const Store = require('..')

const TEST_DIR = p.join(__dirname, 'test-storage')

test('setup', t => {
  mkdirp(TEST_DIR)
  t.end()
})

test('can create and get info for a core', async t => {
  let s = Store(p.join(TEST_DIR, 's1'))
  await s.ready
  let core = await s.get()
  let info = await s.info(core.key)
  t.same(core.sparse, info.sparse)
  t.same(core.writable, info.writable)
  t.end()
})

test.skip('can create and get info for a core, across restarts', t => {
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
