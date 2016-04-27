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
  err: removeEnvsAtPropertyPath([
    'data.job.inspectData.Config',
    'data.job.container.inspect.Config',
    'data.docker.opts'
  ]),
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
    '', // opts.env
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

function _removeEnvs (obj) {
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
    var obj = clone(origninalObj) // Clone object only when key is found
    properties.forEach(function (propertyNamePath) {
      if (propertyNamePath === '') {
        _removeEnvs(obj)
      } else {
        var configEnv = keypather.get(obj, propertyNamePath)
        if (configEnv) {
          keypather.set(obj, propertyNamePath, _removeEnvs(configEnv))
        }
      }
    })
    return obj
  }
}

module.exports = envSerializer

