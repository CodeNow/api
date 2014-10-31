var isFunction = require('101/is-function');
var isString = require('101/is-string');
var expect = require('lab').expect;
var keypather = require('keypather')();
var debug = require('debug')('runnable-api:testing:fixtures:expects');
var exists = require('101/exists');

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
    if (expectedKeypaths) {
      expect(body).to.be.ok;
      if (Array.isArray(expectedKeypaths) && expectedKeypaths.length) {
        // don't allow us to have more than we expect
        expect(body).to.have.length(expectedKeypaths.length);
        var expectedNotFound = [];
        var allItemsFoundInBody = expectedKeypaths.every(function (expectedItem) {
          var found = body.some(function (bodyItem) {
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
            'Body:', JSON.stringify(body)
          ].join(' '));
        }
      } else if (Array.isArray(expectedKeypaths)) {
        expect(body).to.have.length(expectedKeypaths.length);
      } else {
        expectKeypaths(body, expectedKeypaths);
      }
    }
    if (expectedHeaders) {
      expect(res.headers).to.be.okay;
      expectKeypaths(res.headers, expectedHeaders);
    }
    done(null, body, code, res);
  };
};
/*jshint maxdepth:2 */
expects.errorStatus = function (code, messageMatch, done) {
  if (isFunction(messageMatch)) {
    done = messageMatch;
    messageMatch = null;
  }
  return function (err) {
    debug('errorStatus', err);
    expect(err).to.satisfy(exists, 'Expected error response');
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
      expect(body).to.have.property(key, json[key]);
    });
    done();
  };
};
expects.convertObjectId = function(expected) {
  return function (val) {
    expect(val.toString()).to.eql(expected);
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
        expect(keypather.get(body, keypath)).to.match(expectedVal,
          'Expected body.'+keypath+'to match '+expectedVal);
      }
      else if (typeof expectedVal === 'function') {
        expect(keypather.get(body, keypath)).to.satisfy(expectedVal, 'Value for '+keypath);
      }
      else {
        keypather.set(extracted, keypath, keypather.get(body, keypath));
        keypather.set(expected, keypath, expectedVal);
      }
    });
    expect(extracted).to.eql(expected);
  }
}

// Specific expectation helpers
var Sauron = require('models/apis/sauron');
var url = require('url');

/**
 * asserts hipache hosts were updated to latest values
 * @param  {User}     user     user model (instance owner)
 * @param  {Instance} instance instance model
 * @param  {Function} cb       callback
 */
expects.updatedHipacheHosts = function (user, instance, cb) {
  var HipacheHosts = require('models/redis/hipache-hosts'); // must require here, else dns mocks will break
  var mockRoute53 = require('./route53'); // must require here, else dns mocks will break
  var container = instance.containers.models[0];
  var hipacheHosts = new HipacheHosts();

  hipacheHosts.readRoutesForContainer(
    user.attrs.accounts.github.login,
    instance.json(),
    container.json(),
    function (err, redisData) {
      if (err) { return cb(err); }
      var expectedRedisData = {};
      Object.keys(container.attrs.ports).forEach(function (containerPort) {
        var key = toHipacheEntryKey(containerPort, instance, user);
        var val = toHipacheEntryVal(containerPort, container, instance);
        expectedRedisData[key] = val;
        // FIXME: mock get request to route53, and verify using that
        expect(mockRoute53.findRecordIp(key.split('.').slice(1).join('.')))
          .to.equal(instance.attrs.network.hostIp);
      });
      expect(redisData).to.eql(expectedRedisData);
      cb();
    });

};
function toHipacheEntryKey (containerPort, instance, user) {
  containerPort = containerPort.split('/')[0];
  var instanceName = instance.attrs.name;
  var ownerUsername = user.attrs.accounts.github.login;
  var key = [containerPort, '.', instanceName, '.', ownerUsername, '.', process.env.DOMAIN];
  return ['frontend:'].concat(key).join('').toLowerCase();
}
function toHipacheEntryVal (containerPort, container, instance) {
  var actualPort = container.attrs.ports[containerPort][0].HostPort;
  var parsedDockerHost = url.parse(container.attrs.dockerHost);
  var backendUrl = url.format({
    protocol: 'http:',
    slashes: true,
    hostname: parsedDockerHost.hostname,
    port: actualPort
  });
  return [
    instance.attrs.name,
    backendUrl
  ];
}

/**
 * asserts instance hipache hosts to be deleted
 * @param  {User}     user      instance owner (client user model)
 * @param  {Instance} instance  instance (client instance model)
 * @param  {Function} cb        callback
 */
expects.deletedHipacheHosts = function (user, instance, cb) {
  var HipacheHosts = require('models/redis/hipache-hosts'); // must require here, else dns mocks will break
  var mockRoute53 = require('./route53'); // must require here, else dns mocks will break
  var container = instance.containers.models[0];
  var hipacheHosts = new HipacheHosts();

  hipacheHosts.readRoutesForContainer(
    user.attrs.accounts.github.login,
    instance.json(),
    container.json(),
    function (err, redisData) {
      if (err) { return cb(err); }
      var expectedRedisData = {};
      Object.keys(containerJSON.ports).forEach(function (containerPort) {
        var key = toHipacheEntryKey(containerPort, instance, user);
        expectedRedisData[key] = [];
      });
      expect(redisData).to.eql(expectedRedisData);
      expect(mockRoute53.findRecordIp(key.split('.').slice(1).join('.')))
        .to.not.be.ok;
      cb();
    });
};

/**
 * asserts weave container attachment
 * @param  {Instance} instance       instance which container belongs to
 * @param  {Object}   expectedHostIp expected host ip for container
 * @param  {Function} cb             callback
 */
expects.updatedWeaveHost = function (container, expectedHostIp, cb) {
  container = container.toJSON();
  var sauron = new Sauron(container.dockerHost);
  sauron.getContainerIp(container.dockerContainer, function (err, hostIp) {
    if (err) { return cb(err); }
    expect(hostIp, 'hostIp').to.equal(expectedHostIp);
    cb();
  });
};

/**
 * asserts weave entry was deleted
 * @param  {Instance}  instance instance which container should'
 * @param  {Function}  cb       callback
 */
expects.deletedWeaveHost = function (container, cb) {
  container = container.toJSON();
  var sauron = new Sauron(container.dockerHost);
  sauron.getContainerIp(container.dockerContainer, function (err) {
    expect(err).to.exist;
    expect(err.output.statusCode).to.equal(404);
    expect(err.message).to.match(/container/);
    cb();
  });
};