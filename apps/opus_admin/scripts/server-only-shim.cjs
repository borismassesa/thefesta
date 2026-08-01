// `server-only` exists to make a build fail if server code is pulled into a
// client bundle. In a standalone verification script there is no bundle and
// no client, so its throw is a false positive. Resolve it to an empty module
// for this process only; nothing about the app's build is affected.
const Module = require('node:module')
const path = require('node:path')
const original = Module._resolveFilename
const stub = path.join(__dirname, 'empty-module.cjs')
Module._resolveFilename = function (request, ...rest) {
  if (request === 'server-only') return stub
  return original.call(this, request, ...rest)
}
