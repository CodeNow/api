'use strict';

var Code = require('code');
var expect = Code.expect;

var isFunction = require('101/is-function');
var isString = require('101/is-string');
var isObject = require('101/is-object');
var keypather = require('keypather')();
var debug = require('debug')('runnable-api:testing:fixtures:expects');
var exists = require('101/exists');
var Docker = require('models/apis/docker');
var NaviEntry = require('navi-entry');
NaviEntry.setRedisClient(require('models/redis'));

var expects = module.exports = function (keypath) {
  return function (val) {
    keypath.get(expect(val), keypath);
  };
};
/*jshint maxdepth:3 */
expects.success = function (statusCode, expectedKeypaths, expectedHeaders, done) {
  if (isFunction(expectedKeypaths)) {
    done = expectedKeypaths;
    expectedHeaders = null;
    expectedKeypaths = null;
  } else if (isFunction(expectedHeaders)) {
    done = expectedHeaders;
    expectedHeaders = null;
  }
  return function (err, body, code, res) {
    if (err) { return done(err); }
    expect(statusCode).to.equal(code);
    if (expectedHeaders) {
      expect(res.headers).to.exist();
      expectKeypaths(res.headers, expectedHeaders);
    }
    expects.check(expectedKeypaths, body);
    done(null, body, code, res);
  };
};

expects.check = function (expected, object) {
  if (expected) {
    expect(object).to.exist();
    if (Array.isArray(expected) && expected.length) {
      // don't allow us to have more than we expect
      expect(object).to.have.length(expected.length);
      var expectedNotFound = [];
      var allItemsFoundInBody = expected.every(function (expectedItem) {
        var found = object.some(function (bodyItem) {
          try {
            expectKeypaths(bodyItem, expectedItem);
            return true;
          } catch(err) {
            return false;
          }
        });
        if (!found) {
          expectedNotFound.push(expectedItem);
        }
        return found;
      });
      if (!allItemsFoundInBody) {
        throw new Error([
          'Body does not contain:', JSON.stringify(expectedNotFound),
          'Body:', JSON.stringify(object)
        ].join(' '));
      }
    } else if (Array.isArray(expected)) {
      expect(object).to.have.length(expected.length);
    } else {
      expectKeypaths(object, expected);
    }
  }
};

/*jshint maxdepth:2 */
expects.errorStatus = function (code, messageMatch, done) {
  if (isFunction(messageMatch)) {
    done = messageMatch;
    messageMatch = null;
  }
  return function (err) {
    debug('errorStatus', err);
    expect(err, 'Expected ' + code + ' error response').to.satisfy(exists);
    expect(err.output.statusCode).to.equal(code);
    if (messageMatch instanceof RegExp) {
      expect(err.message).to.match(messageMatch);
    }
    else if (isString(messageMatch)) {
      expect(err.message).to.equal(messageMatch);
    }
    done(null, err);
  };
};
expects.error = expects.errorStatus;

expects.updateSuccess = function (json, done) {
  return function (err, body, code) {
    if (err) { return done(err); }
    expect(code).to.equal(200);
    Object.keys(json).forEach(function (key) {
      expect(body[key]).to.equal(json[key]);
    });
    done();
  };
};
expects.convertObjectId = function (expected) {
  return function (val) {
    expect(val.toString()).to.equal(expected);
    return true;
  };
};

expects.expectKeypaths = expectKeypaths;

function expectKeypaths (body, expectedKeypaths) {
  if (expectedKeypaths) {
    var expected = {};
    var extracted = {};
    Object.keys(expectedKeypaths).forEach(function (keypath) {
      var expectedVal = expectedKeypaths[keypath];
      if (expectedVal instanceof RegExp) {
        expect(keypather.get(body, keypath), 'Expected body.' + keypath + 'to match ' + expectedVal)
          .to.match(expectedVal);
      }
      else if (typeof expectedVal === 'function') {
        expect(keypather.get(body, keypath), 'Value for ' + keypath)
          .to.satisfy(expectedVal);
      }
      else {
        keypather.set(extracted, keypath, keypather.get(body, keypath));
        keypather.set(expected, keypath, expectedVal);
      }
    });
    if (Object.keys(expected).length > 0) {
      // bc chai is not asserting eql for nested objects if the key order is diff...
      extracted = sortKeys(extracted);
      expected = sortKeys(expected);
      expect(extracted).to.deep.contain(expected);
    }
  }
}

// Specific expectation helpers
var Sauron = require('models/apis/sauron');

/**
 * assert updated dns and hipache entries
 * NOTE: if instance is provided for instanceOrName args are: (user, instance, cb)
 * @param  {String|Object}  userOrUsername  user client model or string owner
 * @param  {Object}         instanceOrName  instance client model
 * @param  {Object}         container       container client model
 * @param  {String}         hostIp          expected dns hostIp value
 * @param  {Function}       cb              callback
 */
// jshint maxcomplexity:8
expects.updatedHosts = function (userOrUsername, instance, cb) {
  var username = userOrUsername;
  if (isObject(userOrUsername)) {
    username = userOrUsername.attrs.accounts.github.username;
  }
  var instanceName = instance.attrs.lowerName;
  var container = instance.containers.models[0];
  container = container && container.toJSON ? container.toJSON() : container;
  if (!container || !container.ports) {
    process.nextTick(cb);
    return;
  }
  expects.updatedDnsEntry(username, instanceName, instance.attrs.network.hostIp);
  expects.updatedNaviEntries(username, instance, container, cb);
};
// jshint maxcomplexity:6
expects.updatedDnsEntry = function (username, instanceName, hostIp) {
  // dns entry
  // FIXME: mock get request to route53, and verify using that
  var mockRoute53 = require('./route53'); // must require here, else dns mocks will break
  var dnsUrlElastic = toDnsUrl('staging-' + username, instanceName);
  var dnsUrlDirect = toDnsUrl('staging-' + username, 'master-' + instanceName);
  expect(mockRoute53.findRecordIp(dnsUrlElastic), 'dns record ' + dnsUrlElastic).to.equal(hostIp);
  expect(mockRoute53.findRecordIp(dnsUrlDirect), 'dns record ' + dnsUrlDirect).to.equal(hostIp);
};

expects.updatedNaviEntries = function (username, instance, container, cb) {
  if (!container || !container.ports) {
    return cb();
  }
  var instanceName = instance.attrs.lowerName;
  var branch = keypather.get(instance, 'contextVersion.appCodeVersions[0].lowerBranch');
  Object.keys(container.ports).forEach(function (containerPort) {
    containerPort = containerPort.split('/').shift();
    var opts = {
      exposedPort: containerPort,
      branch: branch,
      instanceName: instanceName,
      ownerUsername: username,
      userContentDomain: process.env.USER_CONTENT_DOMAIN,
      masterPod: instance.masterPod || false
    };
    new NaviEntry(opts).lrange(0, -1, function (err, backends) {
      expect(backends[0]).to.deep.equal(opts);
      expect(backends[1]).to.equal(process.env.NAVI_HOST);
    });
  });
  cb(null);
};

/**
 * assert updated dns and hipache entries are non-existant
 * NOTE: if instance is provided for instanceOrName args are: (user, instance, cb)
 * @param  {Object}   userOrUsername  user client model OR username
 * @param  {Object}   instance        instance client model
 * @param  {Object}   container       container client model
 * @param  {String}   hostIp          expected dns hostIp value
 * @param  {Function} cb              callback
 */
// jshint maxcomplexity:8
expects.deletedHosts = function (userOrUsername, instance, container, cb) {
  var username = userOrUsername;
  if (isObject(userOrUsername)) {
    username = userOrUsername.attrs.accounts.github.username;
  }
  var instanceName = instance.attrs.name;

  if (isFunction(container)) {
    cb = container;
    container = null;
  }

  container = container || instance.containers.models[0];

  container = container && container.toJSON ? container.toJSON() : container;
  if (!container || !container.dockerContainer || !container.ports) {
    process.nextTick(cb);
    return;
  }
  expects.deletedDnsEntry(username, instanceName);
  expects.deletedNaviEntries(username, instance, container, cb) ;
};
// jshint maxcomplexity:6
expects.deletedDnsEntry = function (username, instanceName) {
  // dns entry
  // FIXME: mock get request to route53, and verify using that
  var mockRoute53 = require('./route53'); // must require here, else dns mocks will break
  var dnsUrlElastic = toDnsUrl('staging-' + username, instanceName);
  var dnsUrlDirect = toDnsUrl('staging-' + username, 'master-' + instanceName);
  expect(mockRoute53.findRecordIp(dnsUrlElastic), 'dns record ' + dnsUrlElastic).to.not.exist();
  expect(mockRoute53.findRecordIp(dnsUrlDirect), 'dns record ' + dnsUrlDirect).to.not.exist();
};
expects.deletedNaviEntries = function (username, instance, container, cb) {
  if (!container || !container.ports) {
    return cb();
  }
  var instanceName = instance.attrs.lowerName;
  var branch = keypather.get(instance, 'contextVersion.appCodeVersions[0].lowerBranch');
  Object.keys(container.ports).forEach(function (containerPort) {
    containerPort = containerPort.split('/').shift();
    new NaviEntry({
      exposedPort: containerPort,
      branch: branch,
      instanceName: instanceName,
      ownerUsername: username,
      userContentDomain: process.env.USER_CONTENT_DOMAIN,
      masterPod: instance.masterPod || false
    }).lrange(0, -1, function (err, backends) {
      expect(backends.length).to.equal(0);
    });
  });
  cb(null);
};
function toDnsUrl (username, instanceName) {
  return [ instanceName, '-', username, '.', process.env.USER_CONTENT_DOMAIN ].join('');
}

/**
 * assert container was deleted from docker
 * @param  {Object}   container instance container json
 * @param  {Function} cb        callback
 */
expects.deletedContainer = function (container, cb) {
  container = container && container.toJSON ? container.toJSON() : container;
  if (!container.dockerHost) {
    throw new Error('container must have dockerHost');
  }
  if (!container.dockerContainer) {
    throw new Error('container must have dockerContainer');
  }
  var docker = new Docker(container.dockerHost);
  docker.inspectContainer(container, function (err) {
    expect(err, 'deleted container ' + container.dockerContainer).to.exist();
    expect(err.output.statusCode, 'deleted container ' + container.dockerContainer).to.equal(404);
    cb();
  });
};

/**
 * asserts container is attached to weave network hostIp
 * @param  {Container} container      container information
 * @param  {Object}    expectedHostIp expected host ip for container
 * @param  {Function}  cb             callback
 */
expects.updatedWeaveHost = function (container, expectedHostIp, cb) {
  container = container.toJSON();
  var sauron = new Sauron(container.dockerHost);
  sauron.getContainerIp(container.dockerContainer, function (err, hostIp) {
    if (err) { return cb(err); }
    expect(hostIp,
      'Container ' + container.dockerContainer + ' to be attached to ' + expectedHostIp)
      .to.equal(expectedHostIp);
    cb();
  });
};

/**
 * asserts container detached from all weave network hostIps
 * @param  {Container} container container information
 * @param  {Function}  cb        callback
 */
expects.deletedWeaveHost = function (container, cb) {
  container = container.toJSON();
  var sauron = new Sauron(container.dockerHost);
  sauron.getContainerIp(container.dockerContainer, function (err, val) {
    if (err) { return cb(err); }
    expect(val, 'Container ' + container.dockerContainer + ' to be unattached')
      .to.not.exist();
    cb();
  });
};

// bc chai is not asserting eql for nested objects if the key order is diff...
function sortKeys (o) {
  if (!isObject(o)) {
    return o;
  }
  else {
    var out = {};
    Object.keys(o).sort().forEach(function (key) {
      out[key] = isObject(o[key]) ?
        sortKeys(o[key]) :
        o[key];
    });
    return out;
  }
}
