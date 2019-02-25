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

  let core = s.get()
  await core.ready()

  let info = await s.info(core.key)
  t.same(core.sparse, info.sparse)
  t.same(core.writable, info.writable)

  await cleanup(s)
  t.end()
})

test('can create and get info for a core, across restarts', async t => {
  let s = await create(idx)

  let core = s.get()
  await core.ready()

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

  let core1 = s1.get({ valueEncoding: 'utf-8' })
  await core1.ready()
  await append(core1, 'hello!')

  let core2 = s2.get(core1.key, { valueEncoding: 'utf-8' })
  await core2.ready()
  let block = await get(core2, 0)

  // Delay to let the replication propagate.
  setTimeout(async () => {
    t.same(block, 'hello!')
    await cleanup(s1, s2)
    t.end()
  }, 100)
})

test('can create a core that isnt replicating', async t => {
  let s1 = await create(idx++, {
    network: {
      disable: true
    }
  })
  let s2 = await create(idx++)

  let core1 = s1.get()
  await core1.ready()

  let core2 = s2.get(core1.key)
  await core2.ready()

  t.same(core2.key, core1.key)
  await cleanup(s1, s2)
  t.end()
})

test('should not seed if seed is false', async t => {
  let s1 = await create(idx++)
  let s2 = await create(idx++)

  let core1 = s1.get({ valueEncoding: 'utf-8', seed: false })
  await core1.ready()
  await append(core1, 'hello!')

  let core2 = s2.get(core1.key, { valueEncoding: 'utf-8' })
  await core2.ready()

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

  let core1 = s1.get({ valueEncoding: 'utf-8' })
  await core1.ready()
  await append(core1, 'hello!')

  let core2 = s2.get(core1.key, { valueEncoding: 'utf-8' })
  await core2.ready()
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

test('should delete and unseed', async t => {
  let s1 = await create(idx++)
  let s2 = await create(idx++)

  let core1 = s1.get({ valueEncoding: 'utf-8' })
  await core1.ready()
  await append(core1, 'hello!')

  let core2 = s2.get(core1.key, { valueEncoding: 'utf-8' })
  await core2.ready()
  let value = await get(core2, 0)

  // Delay for peer discovery + replication.
  setTimeout(async () => {
    t.same(value, 'hello!')
    await s1.delete(core1.key)
    setTimeout(async () => {
      t.same(core2.peers.length, 0)
      let info = await s1.info(core1.key)
      t.same(info, null)
      await cleanup(s1, s2)
      t.end()
    }, 100)
  }, 100)
})

test('should work without networking', async t => {
  let s = await create(idx++, {
    network: {
      disable: true
    }
  })

  let core = s.get()
  await core.ready()

  let info = await s.info(core.key)
  t.same(core.sparse, info.sparse)
  t.same(core.writable, info.writable)

  await cleanup(s)
  t.end()
})

test('should list all cores', async t => {
  let s = await create(idx++, {
    network: {
      disable: true
    }
  })

  let core1 = s.get()
  let core2 = s.get()
  let core3 = s.get()
  await Promise.all([core1.ready(), core2.ready(), core3.ready()])

  let l = await s.list()
  t.same(l.size, 3)
  t.true(l.get(core1.key.toString('hex')))
  t.true(l.get(core2.key.toString('hex')))
  t.true(l.get(core3.key.toString('hex')))

  await cleanup(s)
  t.end()
})

test('should get a core by name', async t => {
  let s = await create(idx++, {
    network: {
      disable: true
    }
  })

  let core = s.get({ name: 'hello' })
  await core.ready()

  let info = await s.info('hello', { name: true })
  t.same(info.name, 'hello')

  let core2 = await s.getByName('hello')
  t.true(core2.key.equals(core.key))

  await cleanup(s)
  t.end()
})

test('should delete both records for a named core', async t => {
  let s = await create(idx++, {
    network: {
      disable: true
    }
  })

  let core = s.get({ name: 'hello' })
  await core.ready()

  await s.delete(core.key)
  let key = await s.getByName('hello')
  t.false(key)

  await cleanup(s)
  t.end()
})

test('should seed stored keys without inflating cores', async t => {
  let s1 = await create(idx)

  let keys = []

  for (let i = 0; i < 10; i++) {
    let core = s1.get()
    await core.ready()
    await append(core, core.key)
    keys.push(core.key)
    await close(core)
  }

  await s1.close()
  s1 = await create(idx++)

  t.same(s1.coresByKey.size, 0)

  let s2 = await create(idx++)
  for (let i = 0; i < keys.length; i++) {
    let core = s2.get(keys[i])
    await core.ready()
    let val = await get(core, 0)
    t.same(val, keys[i])
    t.same(s1.coresByKey.size, i + 1)
  }

  await cleanup(s1, s2)
  t.end()
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

async function create (idx, opts) {
  opts = {
    network: { port: 4000 + idx },
    ...opts
  }
  let store = Store(p.join(TEST_DIR, `s${idx}`), opts)
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
