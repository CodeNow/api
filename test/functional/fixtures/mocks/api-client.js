/**
 * @module test/functional/fixtures/mocks/api-client
 */

var path = require('path')

// exports
//
module.exports.setup = function (cb) {
  function ownerIsOrg (json) {
    return (json &&
    json.owner &&
    json.owner.github !== this.opts.user.attrs.accounts.github.id)
  }

  // INSTANCE
  mocksForMethods(require('@runnable/api-client/lib/models/instance'), {
    create: function () {
      require('../../fixtures/mocks/github/user')(this.opts.user)
      require('../../fixtures/mocks/github/user')(this.opts.user)
    },
    update: function () {
      require('../../fixtures/mocks/github/user')(this.opts.user)
      require('../../fixtures/mocks/github/user')(this.opts.user)
      require('../../fixtures/mocks/github/user')(this.opts.user)
      require('../../fixtures/mocks/github/user')(this.opts.user)
    },
    fetch: function () {
      require('../../fixtures/mocks/github/user')(this.opts.user)
    },
    start: function () {
      require('../../fixtures/mocks/github/user')(this.opts.user)
    },
    restart: function () {
      require('../../fixtures/mocks/github/user')(this.opts.user)
    },
    stop: function () {
      require('../../fixtures/mocks/github/user')(this.opts.user)
    },
    copy: function () {
      require('../../fixtures/mocks/github/user')(this.opts.user)
    }
  })

  // BUILD
  mocksForMethods(require('@runnable/api-client/lib/models/build'), {
    build: function () {
      require('../../fixtures/mocks/github/user')(this.opts.user)
      require('../../fixtures/mocks/github/user')(this.opts.user)
      require('../../fixtures/mocks/github/user')(this.opts.user)
      require('../../fixtures/mocks/github/repos-username-repo-branches-branch')(
        this.contextVersions.models[0])
    }
  })

  // CONTEXT
  mocksForMethods(require('@runnable/api-client/lib/models/context'), {
    create: function () {
      var opts = optsForCreateOrUpdate.apply(this, arguments)
      if (ownerIsOrg.call(this, opts.json)) {
        require('../../fixtures/mocks/github/user-orgs')(this.opts.user, 11111, 'Runnable1 (org from api-client.js)')
        require('../../fixtures/mocks/github/user-orgs')(this.opts.user, 11111, 'Runnable1 (org from api-client.js)')
      }
    }
  })

  // CONTEXT VERSION
  mocksForMethods(require('@runnable/api-client/lib/models/context/version'), {
    create: function () {
      var opts = optsForCreateOrUpdate.apply(this, arguments)
      var contextId = this.path().split('/')[1]
      if (ownerIsOrg.call(this, opts.json)) {
        require('../../fixtures/mocks/github/user-orgs')(this.opts.user, 11111, 'Runnable1 (org from api-client.js)')
        require('../../fixtures/mocks/github/user-orgs')(this.opts.user, 11111, 'Runnable1 (org from api-client.js)')
      }
      require('../../fixtures/mocks/s3/put-object')(contextId, '/')
    },
    fetch: function () {
      // in case owner is org
      require('../../fixtures/mocks/github/user-orgs')(this.opts.user, 11111, 'Runnable1 (org from api-client.js)')
      require('../../fixtures/mocks/github/user-orgs')(this.opts.user, 11111, 'Runnable1 (org from api-client.js)')
      // FIXME: stores: uncomment if we start using stores in tests as we should
      // var user = this.opts.user
      // var context = user.newContext(this.attrs.context)
      // if (context.attrs.owner &&
      //   context.attrs.owner.github === this.opts.user.attrs.accounts.github.id) {
      //   require('../../fixtures/mocks/github/user')(user)
      // }
      this.appCodeVersions.models.forEach(function (acv) {
        var username = acv.attrs.repo.split('/')[0]
        var repoName = acv.attrs.repo.split('/')[1]
        require('../../fixtures/mocks/github/repos-username-repo-commits')(username, repoName, acv.attrs.commit)
        require('../../fixtures/mocks/github/repos-username-repo-commits')(username, repoName, acv.attrs.commit)
      })
    },
    copyFilesFromSource: function () {
      var contextId = this.path().split('/')[1]
      require('../../fixtures/mocks/s3/get-object')(contextId, '/')
      require('../../fixtures/mocks/s3/get-object')(contextId, '/Dockerfile')
      require('../../fixtures/mocks/s3/put-object')(contextId, '/')
      require('../../fixtures/mocks/s3/put-object')(contextId, '/Dockerfile')
      // in case owner is org
      require('../../fixtures/mocks/github/user-orgs')(this.opts.user, 11111, 'Runnable1 (org from api-client.js)')
    },
    build: function () {
      // FIXME: stores: uncomment if we start using stores in tests as we should
      // var user = this.opts.user
      // var context = user.newContext(this.attrs.context)
      // if (context.attrs.owner &&
      //   context.attrs.owner.github === this.opts.user.attrs.accounts.github.id) {
      //   require('../../fixtures/mocks/github/user')(user)
      // }
    }
  })

  // CONTEXT VERSION FILES
  mocksForMethods(require('@runnable/api-client/lib/models/context/version/file'), {
    create: function () {
      var opts = optsForCreateOrUpdate.apply(this, arguments)
      var contextId = this.path().split('/')[1]
      var name = opts.json.name
      if (typeof name !== 'string') {
        name = ''
      }
      var p = opts.json.path
      if (typeof p !== 'string') {
        p = '/'
      }
      var filepath = path.join(p, name)
      require('../../fixtures/mocks/s3/put-object')(contextId, filepath)
      // in case owner is org
      require('../../fixtures/mocks/github/user-orgs')(this.opts.user, 11111, 'Runnable1 (org from api-client.js)')
    },
    update: function () {
      var contextId = this.path().split('/')[1]
      require('../../fixtures/mocks/s3/put-object')(contextId, this.id())
      // in case owner is org
      require('../../fixtures/mocks/github/user-orgs')(this.opts.user, 11111, 'Runnable1 (org from api-client.js)')
    }
  })

  // APP CODE VERSIONS
  mocksForMethods(require('@runnable/api-client/lib/models/context/version/app-code-version'), {
    create: function () {
      var opts = optsForCreateOrUpdate.apply(this, arguments)
      var username = 'repo-owner'
      var repoName = 'repo-name'
      if (typeof opts.json.repo === 'string') {
        username = opts.json.repo.split('/')[0]
        repoName = opts.json.repo.split('/')[1]
      }

      // in case owner is org
      require('../../fixtures/mocks/github/user-orgs')(this.opts.user, 11111, 'Runnable1 (org from api-client.js)')
      require('../../fixtures/mocks/github/repos-username-repo')(1, username, repoName)
      require('../../fixtures/mocks/github/repos-hooks-get')(username, repoName)
      require('../../fixtures/mocks/github/repos-hooks-post')(username, repoName)
      require('../../fixtures/mocks/github/repos-keys-get')(username, repoName)
      require('../../fixtures/mocks/github/repos-keys-post')(username, repoName)
      require('../../fixtures/mocks/s3/put-object')('/runnable.deploykeys.test/' + opts.json.repo + '.key.pub')
      require('../../fixtures/mocks/s3/put-object')('/runnable.deploykeys.test/' + opts.json.repo + '.key')
    },
    initGithubRepo: function () {
      var opts = optsForCreateOrUpdate.apply(this, arguments)
      if (typeof opts.json.repo !== 'string') {
        opts.json.repo = 'repo-owner/repo-name'
      }
    }
  })

  // callback
  cb()
}

module.exports.clean = function (cb) {
  restoreAllMethods()
  cb()
}

function optsForCreateOrUpdate () {
  var opts = this.formatArgs(arguments).opts
  opts = opts.json || opts.body || opts.qs || opts.headers
    ? opts
    : { json: opts } // assume opts are json if no json/body/qs key
  return opts
}

// mocksForMethod
// mocksForMethod
// mocksForMethod
// mocksForMethod
// mocksForMethod

var originalMethods = {}

originalMethods.get = function (Class, method) {
  return this[Class.name + '.' + method]
}
originalMethods.set = function (Class, method) {
  if (originalMethods.get(Class, method)) {
    throw new Error(['Method already overridden', Class.name, method].join(' '))
  }
  this[Class.name + '.' + method] = {
    Class: Class,
    method: method,
    fn: Class.prototype[method]
  }
}
var spyOnClassMethod = require('function-proxy').spyOnClassMethod
function proxyMethod (Class, method, fn) {
  originalMethods.set(Class, method)
  spyOnClassMethod(Class, method, fn)
}
function restoreMethod (Class, method) {
  var original = originalMethods.get(Class, method)
  if (!original) {
    console.log(['warn: Method not overridden', Class.name, method].join(' '))
    return
  }
  Class.prototype[method] = original.fn
}
function restoreAllMethods () {
  Object.keys(originalMethods).forEach(function (key) {
    if (key === 'get' || key === 'set') { return }
    var Class = originalMethods[key].Class
    var method = originalMethods[key].method
    restoreMethod(Class, method)
    delete originalMethods[key]
  })
}
var ExpressRequest = require('express-request')
function isLoopback (self) {
  return self.opts.client.request instanceof ExpressRequest
}
function mocksForMethods (Class, mockMap) {
  Object.keys(mockMap).forEach(function (method) {
    proxyMethod(Class, method, function () {
      if (!isLoopback(this)) {
        mockMap[method].apply(this, arguments)
      }
    })
  })
}
