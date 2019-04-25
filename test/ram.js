const test = require('tape')

const ram = require('random-access-memory')
// const level = require('level')

const {
  cleanup,
  create,
  append,
  get,
  levelmem
} = require('./helpers/core.js')

let idx = 1000

test('basic', async t => {
  const opts = { valueEncoding: 'utf-8' }
  const s1 = await create(idx++)
  const s2 = await create(idx++, { level: levelmem })
  const s3 = await create(idx++, { level: levelmem, storage: () => ram })

  const c1 = await s1.get({ ...opts })
  await c1.ready()

  const c2 = await s2.get(c1.key, { ...opts })
  await c2.ready()

  const c3 = await s3.get(c1.key, { ...opts })
  await c3.ready()

  await append(c1, 'hello!')
  let res1 = await get(c1, 0)
  let res2 = await get(c2, 0)
  let res3 = await get(c3, 0)

  setTimeout(async () => {
    t.same(res1, 'hello!', 'read on source correct')
    t.same(res2, 'hello!', 'read on file clone correct')
    t.same(res3, 'hello!', 'read on ram clone correct')
    await cleanup(s1, s2, s3)
    t.end()
  }, 100)
})
