/**
 * @module lib/logger/envSerializer
 */
'use strict'
var clone = require('101/clone')
var keypather = require('keypather')()

var envSerializer = {
  args: removeEnvsAtPropertyPath([
    'container.inspect.Config',
    'inspect.Config',
    'instance',
    'inspectData.Config'
  ]),
  container: removeEnvsAtPropertyPath([
    'inspectData.Config',
    'inspect.Config'
  ]),
  containerInspect: removeEnvsAtPropertyPath(['Config']),
  data: removeEnvsAtPropertyPath([
    '', // Empty string to remove `data.env` keypath
    'data',
    'container.inspect.Config',
    'job.container.inspect.Config',
    'job.inspect.Config',
    'job.inspectData.Config',
    'instance',
    'inspectData.Config',
    'docker.opts'
  ]),
  Env: function (env) {
    if (env && Array.isArray(env)) {
      return env.filter(envKeyFilter)
    }
    return env
  },
  err: function (err) {
    var out = {}
    if (!err) {
      out.message = 'NO ERROR! WTF!?'
    }
    if (err.message) {
      out.message = err.message
    } else if (typeof err === 'string') {
      out.message = err
    } else if (typeof err === 'object') {
      out = err
      if (err.stack) {
        out.stack = err.stack
      }
    }

    return out
  },
  instance: removeEnvsAtPropertyPath(['']),
  job: removeEnvsAtPropertyPath([
    'container.inspect.Config',
    'inspect.Config',
    'inspectData.Config'
  ]),
  updateData: removeEnvsAtPropertyPath([
    'container.inspect.Config'
  ]),
  opts: removeEnvsAtPropertyPath([
    '',  // Empty string to remove `opts.env` keypath
    'instance'
  ]),
  result: removeEnvsAtPropertyPath(['']),
  setObject: removeEnvsAtPropertyPath([
    '["container.inspect"].Config.Env'
  ])
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

function removeEnvsAtPropertyPath (properties) {
  return function removeEnvFromObject (origninalObj) {
    var obj = (origninalObj.toJSON) ? origninalObj.toJSON() : clone(origninalObj) // Clone object only when key is found
    properties.forEach(function (propertyNamePath) {
      if (propertyNamePath === '') {
        removeEnvProperties(obj)
      } else {
        var configEnv = keypather.get(obj, propertyNamePath)
        if (configEnv) {
          keypather.set(obj, propertyNamePath, removeEnvProperties(configEnv))
        }
      }
    })
    return obj
  }
}

module.exports = {
  serializer: envSerializer,
  envKeyFilter: envKeyFilter,
  removeEnvProperties: removeEnvProperties,
  removeEnvsAtPropertyPath: removeEnvsAtPropertyPath
}
