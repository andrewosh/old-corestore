# @Frando/corestore

Experimental fork of [@andrewosh/corestore](@andrewosh/corestore) that:

* Makes all primary resources (storage, discovery, level) pluggable
* With this, makes corestore run in both node and the browser. The module include sensible defaults for both - just `require('corestore')` and depending on the environment either the browser or node defaults will be loaded
* Finally, adds support for other hypercore-based datastructures (like hyperdrives) by swapping the hypercore constructor for a factory.

See `/example` for a fully runnable example in the browser. To see it in action:

```bash
git clone https://github.com/Frando/corestore
npm install
npm run example
```

And then open both [http://localhost:8080](http://localhost:8080) and [http://localhost:8081](http://localhost:8081) in the browser. You should be able to create both hyperdrives and hypercores, with persistent in-browser storage and automatically working synchronization between the two instances.


# corestore
[![Build Status](https://travis-ci.org/andrewosh/corestore.svg?branch=master)](https://travis-ci.org/andrewosh/corestore)

Manages and seeds a library of Hypercores.

Networking code lightly modified from [Beaker's implementation](https://github.com/beakerbrowser/beaker-core/blob/master/dat/daemon/index.js)

## Installation
```
npm i corestore --save
```

## Usage
```js
let store = corestore('my-storage-dir')
await store.ready()

// Create a new hypercore, seeded by default.
let core = await store.get()
await core.ready()

// Create a new hypercore with non-default options.
let core = store.get({ valueEncoding: 'utf-8', seed: false })
await core.ready()

// Get an existing hypercore by key (will automatically replicate in the background).
let core = store.get('my-dat-key')

// Stop seeding a hypercore by key (assuming it was already seeding).
await store.update(core.key, { seed: false })

// Delete and unseed a hypercore.
await store.delete(core.key)

// Get the metadata for a stored hypercore.
await store.info(core.key)

// Stop seeding and shut down
await store.close()
```

## API
#### `async get([key], [opts])`
Either load a hypercore by key, or create a new one.

If a core was previously created locally, then it will be writable.

Opts can contain:
```
{
  valueEncoding: string|codec
  seed: bool,
  sparse: bool,
  name: string,
  description: string,
  keyPair: { publicKey, secretKey }
}
```

#### `async update(key, opts)`
Update the metadata associated with a hypercore. If the given hypercore has already been initialized, then its `valueEncoding` or `sparse` options will not be modified.

Updating the `seed` value will enable/disable seeding.

`opts` should match the `get` options.

#### `async info(key)`
Return the metadata associated with the specified hypercore. The metadata schema matches the `get` options.

#### `async list()`
List all hypercores being stored. The result is a `Map` of the form:
```js
Map {
  key1 => metadata1,
  key2 => metadata2,
  ...
}
```

#### `async delete(key)`
Unseed and delete the specified hypercore, if it's currently being stored.

Throws if the key has not been previously stored.

## License
MIT
