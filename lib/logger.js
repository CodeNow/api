/**
 * @module lib/logger
 */
'use strict'
require('loadenv')()

var bunyan = require('bunyan')
var del = require('101/del')
var envIs = require('101/env-is')
var keypather = require('keypather')()
var pick = require('101/pick')
var put = require('101/put')

var streams = []

streams.push({
  level: process.env.LOG_LEVEL_STDOUT,
  stream: process.stdout
})

// Do not log to file on production. Disk
// will fill up and process will die.
if (!envIs('production') &&
  process.env.LOG_LEVEL_FILE) {
  streams.push({
    level: process.env.LOG_LEVEL_FILE,
    path: process.cwd() + '/api.log'
  })
}

var serializers = put(bunyan.stdSerializers, {
  tx: function () {
    var runnableData = keypather.get(process.domain, 'runnableData')
    if (!runnableData) {
      runnableData = {}
    }
    var date = new Date()
    if (runnableData.txTimestamp) {
      // Save delta of time from previous log to this log
      runnableData.txMSDelta = date.valueOf() - runnableData.txTimestamp.valueOf()
    }
    runnableData.txTimestamp = date
    if (runnableData.reqStart) {
      runnableData.txMSFromReqStart = runnableData.txTimestamp.valueOf() -
        runnableData.reqStart.valueOf()
    }
    return runnableData
  },
  req: function (req) {
    return {
      method: req.method,
      url: req.url,
      isInternalRequest: req.isInternalRequest
    }
  },
  build: function (build) {
    return pick(build, ['_id', 'contextVersions', 'owner', 'failed', 'successful', 'completed'])
  },
  sessionUser: function (user) {
    return pick(user, ['_id', 'accounts.github.id', 'accounts.github.login', 'accounts.github.username'])
  },
  container: function (container) {
    // prevent CA files from entering logs
    container = removeEnvsAtPropertyPath(['inspect.Config'])(container)
    if (container && container.modem) {
      return {
        modem: {
          host: keypather.get(container, 'modem.host'),
          timeout: keypather.get(container, 'modem.timeout')
        },
        id: keypather.get(container, 'id')
      }
    } else {
      return pick(container, ['dockerContainer', 'dockerHost'])
    }
  },
  containerInspect: removeEnvsAtPropertyPath(['Config']),
  elapsedTimeSeconds: function (date) {
    return (new Date() - date) / 1000
  },
  err: removeEnvsAtPropertyPath([
    'data.job.inspectData.Config',
    'data.job.container.inspect.Config',
    'data.docker.opts'
  ]),
  response: function (response) {
    // docker API request responses
    if (response && response.modem) {
      return {
        modem: {
          host: keypather.get(response, 'modem.host')
        },
        id: keypather.get(response, 'id')
      }
    } else {
      return response
    }
  },
  args: function (data) {
    return _removeExtraKeys(data)
  },
  opts: function (data) {
    return _removeEnvs(_removeExtraKeys(data))
  },
  data: function (data) {
    data = removeEnvsAtPropertyPath([
      'container.inspect.Config',
      'job.container.inspect.Config',
      'job.inspect.Config',
      'job.inspectData.Config',
      'docker.opts'
    ])(data)
    return _removeExtraKeys(data)
  },
  instance: function (data) {
    return _removeExtraKeys(data)
  },
  contextVersion: function (data) {
    return pick(data, ['_id', 'build._id', 'build.dockerContainer', 'build.completed', 'build.started'])
  },
  update: function (data) {
    return _removeExtraKeys(data)
  },
  contextVersions: function (data) {
    if (Array.isArray(data)) {
      return data.map(serializers.contextVersion)
    }
    return serializers.contextVersion(data)
  }
})

/**
 * attempts to remove unnecessary keys
 * @param  {Object} data object to prune
 * @return {Object}      clone of data with some keys removed
 */
function _removeExtraKeys (data) {
  if (data && data.toJSON) {
    data = data.toJSON()
  }
  if (Array.isArray(data)) {
    return data.map(_removeExtraKeys)
  }
  // we need do this since `null` is also of type object
  if (!data) {
    return {}
  }
  var newData = {}
  if (typeof data === 'object') {
    Object.keys(data).forEach(function (key) {
      if (data[key] && data[key].toJSON) {
        newData[key] = data[key].toJSON()
      } else {
        newData[key] = data[key]
      }
    })
  }
  del(newData, 'instance.contextVersion.build.log')
  del(newData, '$set.build.log')
  del(newData, 'instance.contextVersions[0].build.log')
  del(newData, 'contextVersion.build.log')
  del(newData, 'contextVersions[0].build.log')
  del(newData, 'build.log')
  del(newData, 'log')
  del(newData, 'ca')
  del(newData, 'cert')
  del(newData, 'key')
  return newData
}

function _removeEnvs (obj) {
  function keyChecker (value, key, arr) {
    if (/^RUNNABLE/.test(value)) return true
    if (/^HOST/.test(value)) return true
    if (/^PORT/.test(value)) return true
    return false
  }
  if (obj.Env && Array.isArray(obj.Env)) {
    obj.Env = obj.Env.filter(keyChecker)
  }
  if (obj.env && Array.isArray(obj.env)) {
    obj.env = obj.Env.filter(keyChecker)
  }
  if (obj.ENV && Array.isArray(obj.ENV)) {
    obj.ENV = obj.ENV.filter(keyChecker)
  }
  return obj
}

function removeEnvsAtPropertyPath (properties) {
  return function removeEnvFromObject (obj) {
    properties.forEach(function (propertyNamePath) {
      var configEnv = keypather.get(obj, propertyNamePath)
      if (configEnv) {
        keypather.set(obj, propertyNamePath, _removeEnvs(configEnv))
      }
    })
    return obj
  }
}

module.exports = bunyan.createLogger({
  name: 'api',
  streams: streams,
  serializers: serializers,
  // DO NOT use src in prod, slow
  src: !envIs('production'),
  // default values included in all log objects
  branch: process.env._VERSION_GIT_COMMIT,
  commit: process.env._VERSION_GIT_BRANCH,
  environment: process.env.NODE_ENV
})

module.exports._removeExtraKeys = _removeExtraKeys
module.exports._serializers = serializers
