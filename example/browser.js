const Corestore = require('../browser')
var html = require('choo/html')
var choo = require('choo')
const hyperdrive = require('hyperdrive')
const hypercore = require('hypercore')
const factories = { hyperdrive, hypercore }

renderApp()

function makeStore (name) {
  const store = Corestore(name, { factories })
  return store
}

function renderApp () {
  var app = choo()
  app.use(uiStore)
  app.route('/', mainView)
  app.mount('body')
}

function uiStore (state, emitter) {
  state.list = {}
  state.data = {}
  state.ui = {}

  const store = makeStore('store')
  store.ready().then(update)

  emitter.on('core:add', onadd)
  emitter.on('hyperdrive:writeFile', onwritefile)
  emitter.on('hypercore:append', onappend)
  emitter.on('ui:open', onopen)

  async function onopen (key) {
    state.ui.open = key
    render()
    const info = state.list[key]
    if (!info) return
    switch (info.type) {
      case 'hyperdrive': return readHyperdrive(key)
      case 'hypercore': return readHypercore(key)
    }
  }

  async function onadd (opts) {
    await store.ready()
    if (!opts.key) opts.key = undefined
    let core = await store.get(opts.key, { type: opts.type })
    await core.ready()
    update()
  }

  async function update () {
    await store.ready()
    let list = await store.list()
    state.list = {}
    for (let [key, info] of list) {
      info.key = hex(info.key)
      info.discoveryKey = hex(info.discoveryKey)
      state.list[key] = info
    }
    render()
  }

  async function readHyperdrive (key) {
    state.data[key] = {}
    const drive = await store.get(key)
    await drive.ready()
    const meta = {
      version: drive.version,
      byteLength: (drive.content ? drive.content.byteLength : 0) + (drive.metadata ? drive.metadata.byteLength : 0),
      writable: drive.writable
    }
    state.list[key].meta = meta
    drive.readdir('/', (err, list) => {
      if (err) throw err
      if (!list.length) return
      list.forEach(path => drive.readFile(path, done(path)))
      function done (path) {
        return (err, data) => {
          if (err) throw err
          state.data[key][path] = data.toString()
          render()
        }
      }
    })
  }

  async function readHypercore (key) {
    state.data[key] = []
    const core = await store.get(key)
    await core.ready()
    const meta = {
      length: core.length,
      byteLength: core.byteLength,
      writable: core.writable
    }
    state.list[key].meta = meta
    render()
    const rs = core.createReadStream()
    rs.on('data', d => state.data[key].push(d.toString()))
    rs.on('end', () => render())
  }

  async function onwritefile ({ key, path, data }) {
    const core = await store.get(key)
    core.writeFile(path, Buffer.from(data), (err) => {
      if (err) console.log('write file error', err)
      readHyperdrive(key)
    })
  }

  async function onappend ({ key, data }) {
    const core = await store.get(key)
    core.append(Buffer.from(data), (err) => {
      if (err) console.log('append error', err)
      readHypercore(key)
    })
  }

  function render () {
    console.log('render', state)
    emitter.emit('render')
  }
}

function mainView (state, emit) {
  let options = ['hyperdrive', 'hypercore']
  return html`
    <body>
      <h1>${state.title}</h1>
      <main>
        <div class="core-select">
          ${form()}
          ${list()}
        </div>
        ${open()}
      </main>
    </body>
  `

  function form () {
    return html`
      <form onsubmit=${onsubmit}>
        <p><em>Paste a key to add an existing hypercore or hyperdrive. <br/>Leave field empty and click 'Create' to create a new hypercore or hyperdrive.</em></p>
        <input type="text" name="key" placeholder="Paste key to add an existing archive" style="width: 300px" />
        <select name="type">
          ${options.map(o => html`<option value=${o}>${o}</option>`)}
        </select>
        <button type="submit">Create</button>
      </form>
    `
    function onsubmit (e) {
      emit('core:add', formData(e))
    }
  }

  function list () {
    if (!state.list || !Object.keys(state.list).length) return
    return html`
      <ul class="core-list">
        ${Object.values(state.list).map(item)}
      </ul>`
    function item ({ key, type }) {
      const selected = key === state.ui.open
      const cls = selected ? 'active' : 'dis'
      return html`
        <li class=${cls}>
          <a href="#" onclick=${open}><strong>${type}</strong> ${key}</a>
        </li>
      `
      function open (e) {
        e.preventDefault()
        emit('ui:open', key)
      }
    }
  }

  function open () {
    const key = state.ui.open
    if (!key) return 'nothing open'
    const info = state.list[key]
    const data = state.data[key]
    const writable = info.meta && info.meta.writable
    const debug = html`<pre>${JSON.stringify(info, true, 2)}</pre>`
    let bytype
    if (info.type === 'hyperdrive') bytype = hyperdrive(key, data, writable)
    if (info.type === 'hypercore') bytype = hypercore(key, data, writable)
    return html`
      <div class="core-view">
        <h2><em>${info.type}</em><br />${key}</h2>
        ${bytype}
        <hr />
        ${debug}
      </div>`
  }

  function hyperdrive (key, data, writable) {
    return html`
      <div>
        ${data ? html`
          <ul>
            ${Object.entries(data).map(([path, d]) => html`
              <li><strong>/${path}:</strong> ${d}</li>
            `)}
          </ul>
        ` : ''}
        ${writable ? html`
          <form onsubmit=${onsubmit}>
            <label>Path</label><br />
            <input type="text" name="path" /><br />
            <label>Content</label><br />
            <textarea name="data"></textarea><br />
            <button type="submit">Write!</button>
          </form>
        ` : ''}
      </div>
    `
    function onsubmit (e) {
      const { path, data } = formData(e)
      emit('hyperdrive:writeFile', { key, path, data })
    }
  }

  function hypercore (key, data, writable) {
    return html`
      <div>
        <ul>
          ${data.map((d, i) => html`<li><strong>${i}:</strong> ${d}</li>`)}
        </ul>
        ${writable ? html`
          <form onsubmit=${onsubmit}>
            <textarea name="data"></textarea><br />
            <button type="submit">Append!</button>
          </form>
        ` : ''}
      </div>
    `
    function onsubmit (e) {
      const { data } = formData(e)
      emit('hypercore:append', { key, data })
    }
  }
}

function hex (key) {
  return Buffer.isBuffer(key) ? key.toString('hex') : key
}

function formData (e) {
  e.preventDefault()
  const object = {}
  const data = new window.FormData(e.currentTarget)
  data.forEach((value, key) => { object[key] = value })
  return object
}
