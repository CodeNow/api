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
      expect(res.headers).to.be.okay;
      expectKeypaths(res.headers, expectedHeaders);
    }
    expects.check(expectedKeypaths, body);
    done(null, body, code, res);
  };
};

expects.check = function (expected, object) {
  if (expected) {
    expect(object).to.be.ok;
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
    expect(err, 'Expected '+code+' error response').to.satisfy(exists);
    expect(err.output.statusCode).to.equal(code);
    if (messageMatch instanceof RegExp) {
      expect(err.message).to.match(messageMatch);
    }
    else if (isString(messageMatch)) {
      expect(err.message).to.equal(messageMatch);
    }
    done();
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
expects.convertObjectId = function(expected) {
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
        expect(keypather.get(body, keypath), 'Expected body.'+keypath+'to match '+expectedVal)
          .to.match(expectedVal);
      }
      else if (typeof expectedVal === 'function') {
        expect(keypather.get(body, keypath), 'Value for '+keypath)
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
var url = require('url');

/**
 * assert updated dns and hipache entries
 * NOTE: if instance is provided for instanceOrName args are: (user, instance, cb)
 * @param  {Object}         user            user client model
 * @param  {String|Object}  instanceOrName  instance client model OR instance name
 * @param  {Object}         container       container client model
 * @param  {String}         hostIp          expected dns hostIp value
 * @param  {Function}       cb              callback
 */
expects.updatedHosts = function (user, instanceOrName, container, hostIp, cb) {
  var instanceName, instance;
  if (isObject(instanceOrName)) { // instanceOrInstanceName
    instance = instanceOrName;
    cb = container;
    instanceName = instance.attrs.name;
    container = instance.containers.models[0];
  }
  else {
    instanceName = instanceOrName;
  }
  container = container && container.toJSON ? container.toJSON() : container;
  if (!container || !container.dockerContainer || !container.ports) {
    process.nextTick(cb);
    return;
  }
  expects.updatedDnsEntry(user, instanceName, instance.attrs.network.hostIp);
  expects.updatedHipacheEntries(user, instanceName, container, cb);
};
expects.updatedDnsEntry = function (user, instanceName, hostIp) {
  // dns entry
  // FIXME: mock get request to route53, and verify using that
  var mockRoute53 = require('./route53'); // must require here, else dns mocks will break
  var dnsUrl = toDnsUrl(user, instanceName);
  expect(mockRoute53.findRecordIp(dnsUrl), 'dns record')
    .to.equal(hostIp);
};
expects.updatedHipacheEntries = function (user, instanceName, container, cb) {
  // hipache entries
  var Hosts = require('models/redis/hosts'); // must require here, else dns mocks will break
  var hosts = new Hosts();
  hosts.readHipacheEntriesForContainer(
    user.attrs.accounts.github.login,
    instanceName,
    container,
    function (err, redisData) {
      if (err) { return cb(err); }
      var expectedRedisData = {};
      Object.keys(container.ports).forEach(function (containerPort) {
        var key = toHipacheEntryKey(containerPort, instanceName, user);
        var val = toHipacheEntryVal(containerPort, container, instanceName);
        expectedRedisData[key] = val;
      });
      expect(redisData).to.deep.equal(expectedRedisData);
      cb();
    });
};

/**
 * assert updated dns and hipache entries are non-existant
 * NOTE: if instance is provided for instanceOrName args are: (user, instance, cb)
 * @param  {Object}         user            user client model
 * @param  {String|Object}  instanceOrName  instance client model OR instance name
 * @param  {Object}         container       container client model
 * @param  {String}         hostIp          expected dns hostIp value
 * @param  {Function}       cb              callback
 */
expects.deletedHosts = function (user, instanceOrName, container, cb) {
  var instanceName, instance;
  if (isObject(instanceOrName)) { // instanceOrInstanceName
    instance = instanceOrName;
    cb = container;
    instanceName = instance.attrs.name;
    container = instance.containers.models[0];
  }
  else {
    instanceName = instanceOrName;
  }
  container = container && container.toJSON ? container.toJSON() : container;
  if (!container || !container.dockerContainer || !container.ports) {
    process.nextTick(cb);
    return;
  }
  expects.deletedDnsEntry(user, instanceName);
  expects.deletedHipacheEntries(user, instanceName, container, cb);
};
expects.deletedDnsEntry = function (user, instanceName) {
  // dns entry
  // FIXME: mock get request to route53, and verify using that
  var mockRoute53 = require('./route53'); // must require here, else dns mocks will break
  var dnsUrl = toDnsUrl(user, instanceName);
  expect(mockRoute53.findRecordIp(dnsUrl), 'dns record')
    .to.not.be.ok;
};
expects.deletedHipacheEntries = function (user, instanceName, container, cb) {
  // hipache entries
  var Hosts = require('models/redis/hosts'); // must require here, else dns mocks will break
  var hosts = new Hosts();
  hosts.readHipacheEntriesForContainer(
    user.attrs.accounts.github.login,
    instanceName,
    container,
    function (err, redisData) {
      if (err) { return cb(err); }
      var expectedRedisData = {};
      Object.keys(container.ports).forEach(function (containerPort) {
        var key = toHipacheEntryKey(containerPort, instanceName, user);
        expectedRedisData[key] = [];
      });
      expect(redisData).to.deep.equal(expectedRedisData);
      cb();
    });
};
function toDnsUrl (user, instanceName) {
  var ownerUsername = user.attrs.accounts.github.login;
  return [instanceName, '-', ownerUsername, '.', process.env.USER_CONTENT_DOMAIN].join('');
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
    expect(err, 'deleted container '+container.dockerContainer).to.be.ok;
    expect(err.output.statusCode, 'deleted container '+container.dockerContainer).to.equal(404);
    cb();
  });
};
function toHipacheEntryKey (containerPort, instanceName, user) {
  containerPort = containerPort.split('/')[0];
  var ownerUsername = user.attrs.accounts.github.login;
  var key = [containerPort, '.', instanceName, '-', ownerUsername, '.', process.env.USER_CONTENT_DOMAIN];
  return ['frontend:'].concat(key).join('').toLowerCase();
}
function toHipacheEntryVal (containerPort, container, instanceName) {
  if (container.toJSON) { container = container.toJSON(); }
  var exposedPort = containerPort.split('/')[0];
  var actualPort = container.ports[containerPort][0].HostPort;
  var parsedDockerHost = url.parse(container.dockerHost);
  var backendUrl = url.format({
    protocol: (exposedPort === '443') ? 'https:' : 'http:',
    slashes: true,
    hostname: parsedDockerHost.hostname,
    port: actualPort
  });
  return [
    instanceName,
    backendUrl
  ];
}

/**
 * asserts container is attached to weave network hostIp
 * @param  {Instance} instance       instance which container belongs to
 * @param  {Object}   expectedHostIp expected host ip for container
 * @param  {Function} cb             callback
 */
expects.updatedWeaveHost = function (container, expectedHostIp, cb) {
  container = container.toJSON();
  var sauron = new Sauron(container.dockerHost);
  sauron.getContainerIp(container.dockerContainer, function (err, hostIp) {
    if (err) { return cb(err); }
    expect(hostIp, 'Container '+container.dockerContainer+' to be attached to '+expectedHostIp)
      .to.equal(expectedHostIp);
    cb();
  });
};

/**
 * asserts container detached from all weave network hostIps
 * @param  {Instance}  instance instance which container should'
 * @param  {Function}  cb       callback
 */
expects.deletedWeaveHost = function (container, cb) {
  container = container.toJSON();
  var sauron = new Sauron(container.dockerHost);
  sauron.getContainerIp(container.dockerContainer, function (err, val) {
    if (err) { return cb(err); }
    expect(val, 'Container '+container.dockerContainer+' to be unattached')
      .to.not.be.ok;
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
