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
let core = store.get()
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
