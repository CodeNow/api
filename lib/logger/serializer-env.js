/**
 * @module lib/logger/envSerializer
 */
'use strict'
const traverse = require('traverse')

function cleanDirtyObj (dirtyObj) {
  // Iterate over the dirty object for serialization
  return traverse(dirtyObj)
    .map(function () {
      if (this.parent) {
        if (typeof this.parent.key === 'string' && this.parent.key.toLowerCase() === 'env') {
          if (/^RUNNABLE/.test(this.node)) return
          if (/^HOST/.test(this.node)) return
          if (/^PORT/.test(this.node)) return
          this.update('***SANITIZED***')
        }
      }
    })
}

var envSerializer = {
  args: cleanDirtyObj,
  container: cleanDirtyObj,
  containerInspect: cleanDirtyObj,
  data: cleanDirtyObj,
  Env: function (env) {
    if (env && Array.isArray(env)) {
      return env.filter(envKeyFilter)
    }
    return env
  },
  err: function (err) {
    var out = {}
    if (!err) {
      // no error was passed to this key, return undefined
      return undefined
    }
    if (err && err.message) {
      out.message = err.message
    } else if (typeof err === 'string') {
      out.message = err
    } else if (typeof err === 'object') {
      out = err
      if (err && err.stack) {
        out.stack = err.stack
      }
    }

    if (err.isBoom) {
      out.isBoom = err.isBoom
      out.output = err.output
    }
    return out
  },
  instance: cleanDirtyObj,
  job: cleanDirtyObj,
  updateData: cleanDirtyObj,
  update: cleanDirtyObj,
  opts: cleanDirtyObj,
  result: cleanDirtyObj,
  setObject: cleanDirtyObj
}

function envKeyFilter (value, key, arr) {
  if (/^RUNNABLE/.test(value)) return true
  if (/^HOST/.test(value)) return true
  if (/^PORT/.test(value)) return true
  return false
}

function removeEnvProperties (obj) {
  if (obj.Env && Array.isArray(obj.Env)) {
    obj.Env = obj.Env.filter(envKeyFilter)
  }
  if (obj.env && Array.isArray(obj.env)) {
    obj.env = obj.env.filter(envKeyFilter)
  }
  if (obj.ENV && Array.isArray(obj.ENV)) {
    obj.ENV = obj.ENV.filter(envKeyFilter)
  }
  return obj
}

module.exports = {
  serializer: envSerializer,
  envKeyFilter: envKeyFilter,
  removeEnvProperties: removeEnvProperties
}
