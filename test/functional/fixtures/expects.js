/**
 * @module test/functional/fixtures/expects
 */
'use strict'

var Code = require('code')
var expect = Code.expect

var isFunction = require('101/is-function')
var isString = require('101/is-string')
var isObject = require('101/is-object')
var keypather = require('keypather')()
var exists = require('101/exists')
var Docker = require('models/apis/docker')
var NaviEntry = require('navi-entry')
NaviEntry.setRedisClient(require('models/redis'))

var expects = module.exports = function (keypath) {
  return function (val) {
    keypath.get(expect(val), keypath)
  }
}
expects.success = function (statusCode, expectedKeypaths, expectedHeaders, done) {
  if (isFunction(expectedKeypaths)) {
    done = expectedKeypaths
    expectedHeaders = null
    expectedKeypaths = null
  } else if (isFunction(expectedHeaders)) {
    done = expectedHeaders
    expectedHeaders = null
  }
  return function (err, body, code, res) {
    if (err) { return done(err) }
    expect(statusCode).to.equal(code)
    if (expectedHeaders) {
      expect(res.headers).to.exist()
      expectKeypaths(res.headers, expectedHeaders)
    }
    expects.check(expectedKeypaths, body)
    done(null, body, code, res)
  }
}

expects.check = function (expected, object) {
  if (expected) {
    expect(object).to.exist()
    if (Array.isArray(expected) && expected.length) {
      // don't allow us to have more than we expect
      expect(object).to.have.length(expected.length)
      var expectedNotFound = []
      var allItemsFoundInBody = expected.every(function (expectedItem) {
        var found = object.some(function (bodyItem) {
          try {
            expectKeypaths(bodyItem, expectedItem)
            return true
          } catch (err) {
            return false
          }
        })
        if (!found) {
          expectedNotFound.push(expectedItem)
        }
        return found
      })
      if (!allItemsFoundInBody) {
        throw new Error([
          'Body does not contain:', JSON.stringify(expectedNotFound),
          'Body:', JSON.stringify(object)
        ].join(' '))
      }
    } else if (Array.isArray(expected)) {
      expect(object).to.have.length(expected.length)
    } else {
      expectKeypaths(object, expected)
    }
  }
}

expects.errorStatus = function (code, messageMatch, done) {
  if (isFunction(messageMatch)) {
    done = messageMatch
    messageMatch = null
  }
  return function (err) {
    expect(err, 'Expected ' + code + ' error response').to.satisfy(exists)
    expect(err.output.statusCode).to.equal(code)
    if (messageMatch instanceof RegExp) {
      expect(err.message).to.match(messageMatch)
    } else if (isString(messageMatch)) {
      expect(err.message).to.equal(messageMatch)
    }
    done(null, err)
  }
}
expects.error = expects.errorStatus

expects.updateSuccess = function (json, done) {
  return function (err, body, code) {
    if (err) { return done(err) }
    expect(code).to.equal(200)
    Object.keys(json).forEach(function (key) {
      expect(body[key]).to.equal(json[key])
    })
    done()
  }
}
expects.convertObjectId = function (expected) {
  return function (val) {
    expect(val.toString()).to.equal(expected)
    return true
  }
}

expects.expectKeypaths = expectKeypaths

function expectKeypaths (body, expectedKeypaths) {
  if (expectedKeypaths) {
    var expected = {}
    var extracted = {}
    Object.keys(expectedKeypaths).forEach(function (keypath) {
      var expectedVal = expectedKeypaths[keypath]
      if (expectedVal instanceof RegExp) {
        expect(keypather.get(body, keypath), 'Expected body.' + keypath + 'to match ' + expectedVal)
          .to.match(expectedVal)
      } else if (typeof expectedVal === 'function') {
        expect(keypather.get(body, keypath), 'Value for ' + keypath)
          .to.satisfy(expectedVal)
      } else {
        keypather.set(extracted, keypath, keypather.get(body, keypath))
        keypather.set(expected, keypath, expectedVal)
      }
    })
    if (Object.keys(expected).length > 0) {
      // bc chai is not asserting eql for nested objects if the key order is diff...
      extracted = sortKeys(extracted)
      expected = sortKeys(expected)
      expect(extracted).to.deep.contain(expected)
    }
  }
}

/**
 * assert updated hipache entries
 * NOTE: if instance is provided for instanceOrName args are: (user, instance, cb)
 * @param  {String|Object}  userOrUsername  user client model or string owner
 * @param  {Object}         instanceOrName  instance client model
 * @param  {Object}         container       container client model
 * @param  {Function}       cb              callback
 */
// jshint maxcomplexity:8
expects.updatedHosts = function (userOrUsername, instance, cb) {
  var username = userOrUsername
  if (isObject(userOrUsername)) {
    username = userOrUsername.attrs.accounts.github.username
  }
  var container = instance.containers.models[0]
  container = container && container.toJSON ? container.toJSON() : container
  if (!container || !container.ports) {
    process.nextTick(cb)
    return
  }
  expects.updatedNaviEntries(username, instance, container, cb)
}

expects.updatedNaviEntries = function (username, instance, container, cb) {
  if (!container || !container.ports) {
    return cb()
  }
  var instanceName = instance.attrs.lowerName
  var branch = keypather.get(instance.attrs, 'contextVersion.appCodeVersions[0].lowerBranch')
  var ownerGithub = instance.attrs.owner.github
  var masterPod = instance.attrs.masterPod
  var retErr
  Object.keys(container.ports).forEach(function (containerPort) {
    containerPort = containerPort.split('/').shift()
    var opts = {
      shortHash: instance.attrs.shortHash,
      exposedPort: containerPort,
      branch: branch,
      instanceName: instanceName,
      ownerUsername: username,
      ownerGithub: ownerGithub,
      userContentDomain: process.env.USER_CONTENT_DOMAIN,
      masterPod: masterPod
    }
    new NaviEntry(opts).lrange(0, -1, function (err, backends) {
      if (err) { retErr = err }
      expect(JSON.parse(backends[0])).to.deep.contains(opts)
      expect(backends[1]).to.equal(process.env.NAVI_HOST)
    })
  })
  cb(retErr)
}

/**
 * assert updated hipache entries are non-existant
 * NOTE: if instance is provided for instanceOrName args are: (user, instance, cb)
 * @param  {Object}   userOrUsername  user client model OR username
 * @param  {Object}   instance        instance client model
 * @param  {Object}   container       container client model
 * @param  {Function} cb              callback
 */
// jshint maxcomplexity:8
expects.deletedHosts = function (userOrUsername, instance, container, cb) {
  var username = userOrUsername
  if (isObject(userOrUsername)) {
    username = userOrUsername.attrs.accounts.github.username
  }

  if (isFunction(container)) {
    cb = container
    container = null
  }

  container = container || instance.containers.models[0]

  container = container && container.toJSON ? container.toJSON() : container
  if (!container || !container.dockerContainer || !container.ports) {
    process.nextTick(cb)
    return
  }
  expects.deletedNaviEntries(username, instance, container, cb)
}

expects.deletedNaviEntries = function (username, instance, container, cb) {
  if (!container || !container.ports) {
    return cb()
  }
  var instanceName = instance.attrs.lowerName
  var branch = keypather.get(instance.attrs, 'contextVersion.appCodeVersions[0].lowerBranch')
  var ownerGithub = instance.attrs.owner.github
  var masterPod = instance.attrs.masterPod
  var retErr
  Object.keys(container.ports).forEach(function (containerPort) {
    containerPort = containerPort.split('/').shift()
    new NaviEntry({
      shortHash: instance.attrs.shortHash,
      exposedPort: containerPort,
      branch: branch,
      instanceName: instanceName,
      ownerUsername: username,
      ownerGithub: ownerGithub,
      userContentDomain: process.env.USER_CONTENT_DOMAIN,
      masterPod: masterPod
    }).lrange(0, -1, function (err, backends) {
      if (err) { retErr = err }
      expect(backends.length).to.equal(0)
    })
  })
  cb(retErr)
}

/**
 * assert container was deleted from docker
 * @param  {Object}   container instance container json
 * @param  {Function} cb        callback
 */
expects.deletedContainer = function (container, cb) {
  container = container && container.toJSON ? container.toJSON() : container
  if (!container.dockerHost) {
    throw new Error('container must have dockerHost')
  }
  if (!container.dockerContainer) {
    throw new Error('container must have dockerContainer')
  }
  var docker = new Docker()
  docker.inspectContainer(container, function (err) {
    expect(err, 'deleted container ' + container.dockerContainer).to.exist()
    expect(err.output.statusCode, 'deleted container ' + container.dockerContainer).to.equal(404)
    cb()
  })
}

// bc chai is not asserting eql for nested objects if the key order is diff...
function sortKeys (o) {
  if (!isObject(o)) {
    return o
  } else {
    var out = {}
    Object.keys(o).sort().forEach(function (key) {
      out[key] = isObject(o[key])
        ? sortKeys(o[key])
        : o[key]
    })
    return out
  }
}
