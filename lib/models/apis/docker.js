/**
 * TODO: Document
 * @module lib/models/apis/docker
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var Dockerode = require('dockerode');
var async = require('async');
var concat = require('concat-stream');
var createStreamCleanser = require('docker-stream-cleanser');
var debug = require('debug')('runnable-api:docker:model');
var dogerode = require('dogerode');
var exists = require('101/exists');
var extend = require('101/assign');
var fs = require('fs');
var isFunction = require('101/is-function');
var isString = require('101/is-string');
var join = require('path').join;
var keypather = require('keypather')();
var put = require('101/put');
var url = require('url');

var formatArgs = require('format-args');
var utils = require('middlewares/utils');

// try/catch is a better pattern for this, since checking to see if it exists
// and then reading files can lead to race conditions (unlikely, but still)
var certs = {};
try {
  // DOCKER_CERT_PATH is docker's default thing it checks - may as well use it
  var certPath = process.env.DOCKER_CERT_PATH || '/etc/ssl/docker';
  certs.ca = fs.readFileSync(join(certPath, '/ca.pem'));
  certs.cert = fs.readFileSync(join(certPath, '/cert.pem'));
  certs.key = fs.readFileSync(join(certPath, '/key.pem'));
} catch (e) {
  debug('cannot load certificates for docker!!', keypather.get(e, 'message'));
  // use all or none - so reset certs here
  certs = {};
}

module.exports = Docker;

function Docker (dockerHost) {
  debug('new Docker', dockerHost);
  if (!dockerHost) {
    throw new Error('dockerHost required');
  }
  var parsed = ~dockerHost.indexOf('http:') ?
    url.parse(dockerHost) :
    url.parse('http://'+dockerHost);
  this.dockerHost = parsed.protocol +'//'+ parsed.host;
  this.port = parsed.port;
  var dockerodeOpts = {
    host: this.dockerHost,
    port: this.port
  };
  extend(dockerodeOpts, certs);
  this.docker = dogerode(new Dockerode(dockerodeOpts), {
    service: 'api',
    host: process.env.DATADOG_HOST,
    port: process.env.DATADOG_PORT
  });
}

/**
 * Get environment variables for image-builder container run
 * @return {array} env strings
 */
function getEnvForImageBuilder (opts) {
  var version = opts.version;
  var dockerTag = opts.dockerTag;

  var infraCodeVersion = version.infraCodeVersion;
  var bucket = infraCodeVersion.bucket();
  var indexedVersions = {};
  infraCodeVersion.files.forEach(function (file) {
    indexedVersions[file.Key] = file.VersionId;
  });

  var env = [
    'RUNNABLE_AWS_ACCESS_KEY=' + process.env.AWS_ACCESS_KEY_ID,
    'RUNNABLE_AWS_SECRET_KEY=' + process.env.AWS_SECRET_ACCESS_KEY,
    'RUNNABLE_FILES_BUCKET='   + bucket.bucket,
    'RUNNABLE_PREFIX='         + join(bucket.sourcePath, '/'),
    'RUNNABLE_FILES='          + JSON.stringify(indexedVersions),
    'RUNNABLE_DOCKER='         + 'unix:///var/run/docker.sock',
    'RUNNABLE_DOCKERTAG='      + dockerTag,
    'RUNNABLE_IMAGE_BUILDER_NAME=' + process.env.DOCKER_IMAGE_BUILDER_NAME,
    'RUNNABLE_IMAGE_BUILDER_TAG=' + process.env.DOCKER_IMAGE_BUILDER_VERSION
  ];

  var repoUrls = [];
  var commitishs = [];
  var deployKeys = [];
  version.appCodeVersions.forEach(function (acv) {
    repoUrls.push('git@github.com:' + acv.repo);
    // use either a commit, branch, or default to master
    if (acv.commit) {
      commitishs.push(acv.commit);
    } else if (acv.branch) {
      commitishs.push(acv.branch);
    } else {
      commitishs.push('master');
    }
    if (acv.privateKey) {
      deployKeys.push(acv.privateKey);
    }
  });
  env.push('RUNNABLE_REPO='        + repoUrls.join(';'));
  env.push('RUNNABLE_COMMITISH='   + commitishs.join(';'));
  env.push('RUNNABLE_KEYS_BUCKET=' + process.env.GITHUB_DEPLOY_KEYS_BUCKET);
  env.push('RUNNABLE_DEPLOYKEY='   + deployKeys.join(';'));

  if (process.env.DOCKER_IMAGE_BUILDER_CACHE) {
    env.push('DOCKER_IMAGE_BUILDER_CACHE=' + process.env.DOCKER_IMAGE_BUILDER_CACHE);
  }
  if (process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE) {
    env.push('DOCKER_IMAGE_BUILDER_LAYER_CACHE=' + process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE);
  }

  // need to add network to builds
  env.push('RUNNABLE_NETWORK_DRIVER=' + process.env.RUNNABLE_NETWORK_DRIVER);
  env.push('RUNNABLE_WAIT_FOR_WEAVE=' + process.env.RUNNABLE_WAIT_FOR_WEAVE);
  env.push('RUNNABLE_SAURON_HOST='    + opts.sauronHost);
  env.push('RUNNABLE_NETWORK_IP='     + opts.networkIp);
  env.push('RUNNABLE_HOST_IP='        + opts.hostIp);

  // build cpu limit
  var buildOpts = {
    Memory: process.env.CONTAINER_MEMORY_LIMIT_BYTES,
    forcerm: true
  };
  if (opts.noCache === true) {
    buildOpts.nocache = true;
  }
  env.push('RUNNABLE_BUILD_FLAGS=' + JSON.stringify(buildOpts));

  return env;
}

/**
 * get docker tag url
 * @param  {object} sessionUser user mongo model
 * @param  {object} version     version mongo model
 * @return {string}             dockerUrl
 */
Docker.prototype.getDockerTag = function (sessionUser, version) {
  return join(
    process.env.REGISTRY_DOMAIN + '/',
    sessionUser.accounts.github.id.toString(),
    version.context + ':' + version._id);
};

/**
 * Create image-builder container and attach to it.
 * @param  {ContextVersion}  version     contextVersion that needs to be built
 * @param  {String        }  dockerTag   tag for image which image-builder is creating
 * @param  {Function      }  cb          callback(err, container)
 */
// FIXME: error handling
Docker.prototype.createImageBuilder = function (version, dockerTag, network, noCache, cb) {
  /*jshint maxcomplexity:6*/
  debug('createImageBuilder', formatArgs(arguments));
  if (version.build.completed) {
    cb(Boom.conflict('Version already built', version));
  }
  else if (!version.infraCodeVersion) {
    cb(Boom.badRequest('Cannot build a version without a Dockerfile', version));
  }
  else if (utils.isObjectId(version.infraCodeVersion)) {
    cb(Boom.badRequest('Populate infraCodeVersion before building it', version));
  }
  else {
    var self = this;
    debug('create container');
    var builderContainerData = {
      name: version.build._id.toString(),
      Image: process.env.DOCKER_IMAGE_BUILDER_NAME + ':' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
      Env: getEnvForImageBuilder({
        version: version,
        dockerTag: dockerTag,
        sauronHost: url.parse(self.dockerHost).hostname+':'+process.env.SAURON_PORT,
        networkIp: network.networkIp,
        hostIp: network.hostIp,
        noCache: noCache
      }),
      Binds: [],
      Volumes: {}
    };
    if (process.env.DOCKER_IMAGE_BUILDER_CACHE) {
      builderContainerData.Binds.push(
        process.env.DOCKER_IMAGE_BUILDER_CACHE + ':/cache:rw');
      builderContainerData.Volumes['/cache'] = {};
    }
    if (process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE) {
      builderContainerData.Binds.push(
        process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE + ':/layer-cache:rw');
      builderContainerData.Volumes['/layer-cache'] = {};
    }
    self.createContainer(builderContainerData, cb);
  }
};

/**
 * Start the image builder container and wait for it's logs
 * @param  {Container|String} container   image-builder container (dockerode) or containerId
 * @param  {Function        } cb          callback(err, container, stream)
 */
// FIXME: error handling
/*jshint maxcomplexity:6*/
var successRe = /Successfully built ([a-f0-9]+)/;
Docker.prototype.startImageBuilderContainer = function (container, cb) {
  debug('startImageBuilderContainer', formatArgs(arguments));
  var self = this;
  var binds = [
    '/var/run/docker.sock:/var/run/docker.sock'
  ];
  debug('create container');
  var startContainerData = {
    Binds: binds
  };
  if (process.env.DOCKER_IMAGE_BUILDER_CACHE) {
    startContainerData.Binds.push(process.env.DOCKER_IMAGE_BUILDER_CACHE + ':/cache:rw');
  }
  if (process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE) {
    startContainerData.Binds.push(
      process.env.DOCKER_IMAGE_BUILDER_LAYER_CACHE + ':/layer-cache:rw');
  }
  self.startContainer(container, startContainerData, cb);
};

/**
 * should return all build info. logs, tag,
 * @param  {[type]}   containerId [description]
 * @param  {Function} cb          [description]
 * @return {[type]}               [description]
 */
Docker.prototype.getBuildInfo = function(containerId, cb) {
  debug('getBuildInfo', formatArgs(arguments));
  var self = this;
  var container = self.docker.getContainer(containerId);
  container.logs({
    follow: false,
    stdout: true,
    stderr: true
  }, function (err, stream) {
    debug('build logs recieved - ', 'err:', err);
    var errDebug = { containerId: containerId };
    if (err) {
      return self.handleErr(cb, 'docker logs failed', errDebug)(err);
    }
    var streamCleanser = createStreamCleanser();
    stream.on('error',
      self.handleErr(cb, 'docker logs stream failed', errDebug));
    streamCleanser.on('error',
      self.handleErr(cb, 'docker stream cleanser failed', errDebug));
    stream
      .pipe(streamCleanser)
      .pipe(concat(function (log) {
        log = log.toString();
        debug('build logs cleansed', 'hasLog:', !!log, log);
        var match = successRe.exec(log);
        var buildFailed = !match || !match[1];
        var image = buildFailed ? null : match[1];
        cb(null, {
          dockerImage: image,
          log: log,
          failed: buildFailed
        });
      }));
  });
};

/**
 * This function fetches a container, queries Docker for it's logs, and sends them to the supplied
 * callback
 * @param containerId Id of the container to grab logs from
 * @param tail count
 * @param cb Callback to send the log stream back to
 */
Docker.prototype.getLogs = function (containerId, tail, cb) {
  debug('getLogs', formatArgs(arguments));
  if (typeof tail === 'function') {
    cb = tail;
    tail = 'all';
  }
  var container = this.docker.getContainer(containerId);
  if (!container) {
    cb(new Error('The requested container has not been created'));
  } else {
    // With the container, we can request the logs
    // TODO: add max length of log lines to tail
    container.logs({follow: true, stdout: true, stderr: true, tail: tail}, cb);
  }
};

/**
 * creates a user container
 * @param version: version object which contains build
 * @param opts:    opts to pass to docker
 * @param cb: Callback
 */
var requiredLabels = [
  'type',
  'contextVersionId',
  'instanceId',
  'instanceName',
  'instanceShortHash',
  'ownerUsername',
  'creatorGithubId',
  'ownerGithubId'
];
Docker.prototype.createUserContainer = function (version, opts, cb) {
  var req = findReqFromDomain();
  if (req) {
    debug('createUserContainer', 'req!', req.method, req.url);
  }
  else {
    debug('createUserContainer', 'sorry no req found!');
  }
  debug('createUserContainer', formatArgs(arguments));
  if (!version.build || !version.build.dockerTag) {
    return cb(Boom.badRequest('Cannot create a container for an unbuilt version', {
      debug: { versionId: version._id.toString() }
    }));
  }
  if (isFunction(opts)) {
    cb = opts;
    opts = {};
  }
  if (!opts.Env) {
    throw new Error('"opts.Env" is required');
  }
  if (!opts.Labels) {
    throw new Error('"opts.Labels" is required');
  }
  // Set the Label type is user-container - used in dockerListener
  opts.Labels.type = 'user-container';
  requiredLabels.forEach(function (required) {
    if (!exists(opts.Labels[required])) {
      var message = '"opts.Labels.' + required + '" is required';
      throw new Error(message);
    }
  });
  opts = put(opts, {
    Image: version.build.dockerTag
  });
  this.createContainer(opts, cb);
};

// helpers
var find = require('101/find');
function findReqFromDomain () {
  if (keypather.get(process, 'domain.members.length')) {
    var found = find(process.domain.members, function (member) {
      return Boolean(member.req);
    });
    return found && found.req;
  }
}

/**
 * start a user container
 * @param {String|Object} container - container object to start
 * @param {Object} opts - opts to pass to docker
 * @param {Function} cb - Callback
 */
Docker.prototype.startUserContainer = function (container, opts, cb) {
  debug('startUserContainer', formatArgs(arguments));
  if (!container) {
    return cb(Boom.badRequest('Container must be provided to start'));
  }
  if (isFunction(opts)) {
    cb = opts;
    opts = {};
  }
  // order matters here , our custom DNS should come first
  var dns = [];
  if (exists(process.env.CHARON_HOST)) {
    dns.push(process.env.CHARON_HOST);
  }
  dns.push(process.env.DNS_DEFAULT_IPADDRESS);
  opts = put(opts, {
    PublishAllPorts: true,
    Dns: dns
  });
  this.startContainer(container, opts, cb);
};

/**
 * inspect a user container
 * @param container: container object to inspect
 * @param cb: Callback
 */
Docker.prototype.inspectUserContainer = function (container, cb) {
  debug('inspectUserContainer', formatArgs(arguments));
  if (!container) {
    return cb(Boom.badRequest('Container must be provided to start'));
  }
  var self = this;
  self.inspectContainer(container, function(err, inspect) {
    if (err) { return cb(err); }
    inspect.dockerHost = self.dockerHost;
    cb(null, inspect);
  });
};
/**
 * CONTAINER METHODS - START
 */

/**
 * create a docker container
 * @param  {imageId}  imageId id of the image from which to make a container
 * @param  {Function} cb      callback(err, container)
 */
Docker.prototype.createContainer = function (opts, cb) {
  debug('createContainer', formatArgs(arguments));
  var self = this;
  if (isFunction(opts)) {
    cb = opts;
    opts = {};
  }

  opts.Memory = process.env.CONTAINER_MEMORY_LIMIT_BYTES;
  self.docker.createContainer(opts,
    self.handleErr(callback, 'Create container failed', { opts: opts }));
  function callback (err, container) {
    if (err) { return cb(err); }
    // normalize id to uppercase....
    container.Id = container.id || container.Id;
    cb(null, container);
  }
};

/**
 * docker inspect   container
 * @param container docker container or mongo container object
 * @param cb        callback(err)
 */
Docker.prototype.inspectContainer = function (container, cb) {
  debug('inspectContainer', formatArgs(arguments));
  var containerId = container.dockerContainer || container.Id;
  this.docker
    .getContainer(containerId)
    .inspect(this.handleErr(cb, 'Inspect container failed', { containerId: containerId }));
};

/**
 * attempts to start a stoped container
 * @param {String|Object} container - container object to start
 * @param {Object} opts
 * @param {Function} cb - Callback
 */
Docker.prototype.startContainer = function (container, opts, cb) {
  debug('startContainer', formatArgs(arguments));
  var self = this;
  var containerId = isString(container) ?
    container : (container.dockerContainer || container.Id);
  if (isFunction(opts)) {
    cb = opts;
    opts = {};
  }
  self.docker
    .getContainer(containerId)
    .start(opts,
      self.handleErr(cb, 'Start container failed', { containerId: containerId, opts: opts }));
};

/**
 * attempts to start a stoped container
 * @param container: container object to start
 * @param cb: Callback
 */
Docker.prototype.restartContainer = function (container, cb) {
  debug('restartContainer', formatArgs(arguments));
  var self = this;
  var containerId = container.dockerContainer || container.Id;
  self.docker
    .getContainer(containerId)
    .restart({},
      self.handleErr(cb, 'Restart container failed', { containerId: containerId }));
};

/**
 * attempts to stop a running container.
 * if not stopped in passed in time, the process is kill 9'd
 * @param container  docker container or mongo container object
 * @param force      Force stop a container. Ignores 'already stopped' error.
 * @param cb         callback
 */
Docker.prototype.stopContainer = function (container, force, cb) {
  debug('stopContainer', formatArgs(arguments));
  if (isFunction(force)) {
    cb = force;
    force = false;
  }
  var self = this;
  var containerId = container.dockerContainer || container.Id;
  var opts = {
    t: process.env.CONTAINER_STOP_LIMIT
  };
  self.docker
    .getContainer(containerId)
    .stop(opts,
      self.handleErr(callback, 'Stop container failed',
        { opts: opts, containerId: containerId }));

  function callback (err) {
    // ignore "already stopped" error (304 not modified)
    if (err && (!force && notModifiedError(err))) {
      return cb(err);
    }
    var args = Array.prototype.slice.call(arguments);
    args[0] = null; // ignore err
    cb.apply(null, args);
  }
};
function notModifiedError (err) {
  if (err.output.statusCode === 304) {
    return true;
  }
}

/**
 * attempts to remove a non-running container.
 * if the container is running, an error should be thrown
 * @param container docker container or mongo container object
 * @param cb        callback(err)
 */
Docker.prototype.removeContainer = function (container, cb) {
  debug('removeContainer', formatArgs(arguments));
  var self = this;
  var containerId = container.dockerContainer || container.Id;
  self.docker
    .getContainer(containerId)
    .remove({},
      self.handleErr(cb, 'Remove container failed', { containerId: containerId }));
};

/**
 * stop an array of containers
 * @param containers: array of container objects kill
 * @param force: Force stop a container. Ignores 'already stopped' error.
 * @param cb: Callback
 */
Docker.stopContainers = function (containers, force, cb) {
  if (!Array.isArray(containers)) {
    containers = [containers];
  }
  if (isFunction(force)) {
    cb = force;
    force = false;
  }
  async.map(
    containers,
    function (container, cb) {
      var docker = new Docker(container.dockerHost);
      docker.stopContainer(container, force, cb);
    }, cb);

};

/**
 * removes an array of containers
 * @param containers  array of container objects to remove
 * @param cb          callback(err)
 */
Docker.removeContainers = function (containers, cb) {
  if (!Array.isArray(containers)) {
    containers = [containers];
  }
  async.map(
    containers,
    function (container, cb) {
      var docker = new Docker(container.dockerHost);
      docker.removeContainer(container, cb);
    }, cb);
};

/**
 * CONTAINER METHODS - END
 */


/**
 * returns a callback which will cast docker errors to boom errors (if an error occurs)
 * @param  {Function} cb         callback to pass arguments through to
 * @param  {String}   errMessage boom error message
 * @param  {Object}   errDebug   docker error debug info
 */
Docker.prototype.handleErr = function (cb, errMessage, errDebug) {
  var self = this;
  /*jshint maxcomplexity:10*/
  return function (err) {
    if (err) {
      var code;
      if (!err.statusCode) {
        code = 504;
      }
      else if (err.statusCode === 500) {
        code = 502;
      }
      else { // code >= 400 && code !== 500
        code = err.statusCode;
      }
      var dockerErrMessage = err.message.split(' - ')[1] || err.reason;
      var message = dockerErrMessage ?
        errMessage+': '+dockerErrMessage :
        errMessage;
      var errDocker = extend({
        host: self.dockerHost,
        port: self.port
      }, errDebug || {});

      if (code >= 400) {
        cb(Boom.create(code, message, { docker: errDocker, err: err }));
      }
      else {
        // FIXME: hack for now - we need a way of transporting 300 errors to the user
        // other than boom..
        var boomErr = Boom.create(400, message, { docker: errDocker, err: err });
        boomErr.output.statusCode = code;
        cb(boomErr);
      }
      return;
    }
    cb.apply(null, arguments);
  };
};
