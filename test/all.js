const p = require('path')
const fs = require('fs-extra')

const test = require('tape')
const mkdirp = require('mkdirp')

const Store = require('..')

const TEST_DIR = p.join(__dirname, 'test-storage')
let idx = 0

test('setup', t => {
  mkdirp(TEST_DIR)
  t.end()
})

test('can create and get info for a core', async t => {
  let s = await create(idx++)
  let core = await s.get()
  let info = await s.info(core.key)
  t.same(core.sparse, info.sparse)
  t.same(core.writable, info.writable)

  await cleanup(s)
  t.end()
})

test('can create and get info for a core, across restarts', async t => {
  let s = await create(idx)
  let core = await s.get()
  await s.close()

  s = await create(idx++)
  let info = await s.info(core.key)
  t.same(core.sparse, info.sparse)
  t.same(core.writable, true)

  await cleanup(s)
  t.end()
})

test('can create and replicate a core', async t => {
  let s1 = await create(idx++)
  let s2 = await create(idx++)

  let core1 = await s1.get({ valueEncoding: 'utf-8' })
  await append(core1, 'hello!')

  let core2 = await s2.get(core1.key, { valueEncoding: 'utf-8' })
  let block = await get(core2, 0)

  // Delay to let the replication propagate.
  setTimeout(async () => {
    t.same(block, 'hello!')
    await cleanup(s1, s2)
    t.end()
  }, 100)
})

test('should not seed if seed is false', async t => {
  let s1 = await create(idx++)
  let s2 = await create(idx++)

  let core1 = await s1.get({ valueEncoding: 'utf-8', seed: false })
  await append(core1, 'hello!')

  let core2 = await s2.get(core1.key, { valueEncoding: 'utf-8' })

  // Delay for peer discovery.
  setTimeout(async () => {
    t.same(core2.peers.length, 0)
    await cleanup(s1, s2)
    t.end()
  }, 100)
})

test('should stop seeding', async t => {
  let s1 = await create(idx++)
  let s2 = await create(idx++)

  let core1 = await s1.get({ valueEncoding: 'utf-8' })
  await append(core1, 'hello!')

  let core2 = await s2.get(core1.key, { valueEncoding: 'utf-8' })
  let value = await get(core2, 0)

  // Delay for peer discovery + replication.
  setTimeout(async () => {
    t.same(value, 'hello!')
    await s1.update(core1.key, { seed: false })
    setTimeout(async () => {
      t.same(core2.peers.length, 0)
      await cleanup(s1, s2)
      t.end()
    }, 100)
  }, 100)
})

test.skip('should delete and unseed', async t => {
})

test('teardown', t => {
  fs.remove(TEST_DIR)
  t.end()
})

async function cleanup () {
  for (var i = 0; i < arguments.length; i++) {
    let store = arguments[i]
    await store.close()
    await fs.remove(store.dir)
  }
}

async function create (idx) {
  console.log('CREATING WITH IDX:', idx)
  let store = Store(p.join(TEST_DIR, `s${idx}`), { network: { port: 4000 + idx } })
  await store.ready
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
