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

var dogstatsd = require('models/datadog');
var logger = require('middlewares/logger')(__filename);
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
  logger.log.info({err: e}, 'cannot load certificates for docker!!');
  // use all or none - so reset certs here
  certs = {};
}

/**
 * Calculate # seconds elapsed between dates
 */
function calculateDurationSeconds (start) {
  return (new Date() - start / 1000) | 0;
}

module.exports = Docker;

function Docker (dockerHost) {
  logger.log.trace({tx: true, dockerHost: dockerHost}, 'new Docker');
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
    port: this.port,
    timeout: parseInt(process.env.API_DOCKER_TIMEOUT)
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
 * @param  {Boolean}         manualBuild automatic or manual build
 * @param  {Object}          sessionUser currently authenticated user
 * @param  {ContextVersion}  version     contextVersion that needs to be built
 * @param  {String        }  dockerTag   tag for image which image-builder is creating
 * @param  {Function      }  cb          callback(err, container)
 */
// FIXME: error handling
/*jshint maxcomplexity: 6, maxparams: 7 */
Docker.prototype.createImageBuilder = function (
  manualBuild, sessionUser, version, dockerTag, network, noCache, cb
) {
  logger.log.trace({
    dockerTag: dockerTag,
    manualBuild: manualBuild,
    network: network,
    noCache: noCache,
    sessionUser: sessionUser,
    tx: true,
    version: version
  }, 'createImageBuilder');
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
    var Labels = keypather.flatten(version.toJSON(), '.', 'contextVersion');
    Labels.manualBuild = manualBuild;
    Labels.sessionUserDisplayName = keypather.get(sessionUser, 'accounts.github.displayName');
    Labels.sessionUserUsername = keypather.get(sessionUser, 'accounts.github.username');
    Labels.sessionUserId = keypather.get(sessionUser, 'accounts.github.id');
    Labels.type = 'image-builder-container';
    Labels.dockerTag = dockerTag;
    Labels.sauronHost = url.parse(self.dockerHost).hostname+':'+process.env.SAURON_PORT;
    Labels.networkIp = network.networkIp;
    Labels.hostIp = network.hostIp;
    Labels.noCache = noCache;
    Labels.tid = keypather.get(process.domain, 'runnableData.tid');
    Object.keys(Labels).forEach(function (key) {
      if (keypather.get(Labels, key+'.toString')) {
        Labels[key] = Labels[key].toString();
      }
      else {
        Labels[key] = ''+Labels[key];
      }
    });
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
      Volumes: {},
      Labels: Labels
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
  logger.log.trace({tx: true, container: container}, 'startImageBuilderContainer');
  var self = this;
  var binds = [
    '/var/run/docker.sock:/var/run/docker.sock'
  ];
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
  logger.log.trace({tx: true, containerId: containerId}, 'getBuildInfo');
  var self = this;
  var container = self.docker.getContainer(containerId);
  container.logs({
    follow: false,
    stdout: true,
    stderr: true
  }, function (err, stream) {
    logger.log.trace({tx: true, err: err}, 'getBuildInfo build logs received');
    var errDebug = { containerId: containerId };
    if (err) {
      logger.log.error({
        tx: true,
        err: err
      }, 'getBuildInfo error');
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
        logger.log.trace({
          tx: true,
          log: log
        }, 'build logs cleansed');
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
  logger.log.trace({
    tx: true,
    containerId: containerId,
    tail: tail
  }, 'getLogs');
  if (typeof tail === 'function') {
    cb = tail;
    tail = 'all';
  }
  var container = this.docker.getContainer(containerId);
  if (!container) {
    logger.log.error({
      tx: true,
      containerId: containerId
    }, 'getLogs error, container not created');
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
  logger.log.trace({
    tx: true,
    version: version,
    opts: opts
  }, 'createUserContainer');
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
  opts.Labels.tid = keypather.get(process.domain, 'runnableData.tid');
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

/**
 * start a user container
 * @param {String|Object} container - container object to start
 * @param {Object} opts - opts to pass to docker
 * @param {Function} cb - Callback
 */
Docker.prototype.startUserContainer = function (container, ownerId, opts, cb) {
  logger.log.trace({
    tx: true,
    container: container,
    opts: opts
  }, 'startUserContainer');
  if (!container) {
    return cb(Boom.badRequest('Container must be provided to start'));
  }
  if (isFunction(opts)) {
    cb = opts;
    opts = {};
  }

  // order matters here , our custom DNS should come first
  var dns = [];

  // CodeNow organization in production has a specific weave ip for charon to
  // fix the dns issues. This will be reworked once we have single tenant run
  // docks for each customer.
  if (
    ownerId === process.env.CODENOW_GITHUB_ID &&
    exists(process.env.CODENOW_CHARON_WEAVE_IP)
  ) {
    dns.push(process.env.CODENOW_CHARON_WEAVE_IP);
  }

  if (exists(process.env.CHARON_HOST)) {
    dns.push(process.env.CHARON_HOST);
  }

  dns.push(process.env.DNS_DEFAULT_IPADDRESS);

  opts = put(opts, {
    PublishAllPorts: true,
    Dns: dns
  });
  var start = new Date();
  this.startContainer(container, opts, function (err) {
    if (err) {
      logger.log.error({
        tx: true,
        container: container,
        opts: opts,
        durationSeconds: calculateDurationSeconds(start),
        err: err
      }, 'startUserContainer: error');
    }
    else {
      logger.log.trace({
        tx: true,
        container: container,
        opts: opts,
        durationSeconds: calculateDurationSeconds(start),
      }, 'startUserContainer: success');
    }
    cb.apply(this, arguments);
  });
};

/**
 * inspect a user container
 * @param container: container object to inspect
 * @param cb: Callback
 */
Docker.prototype.inspectUserContainer = function (container, cb) {
  logger.log.trace({
    tx: true,
    container: container
  }, 'inspectUserContainer');
  if (!container) {
    return cb(Boom.badRequest('Container must be provided to start'));
  }
  var self = this;
  var start = new Date();
  self.inspectContainer(container, function(err, inspect) {
    if (err) {
      logger.log.error({
        tx: true,
        err: err,
        durationSeconds: calculateDurationSeconds(start)
      }, 'Docker.prototype.inspectUserContainer inspectContainer error');
      return cb(err);
    }
    else {
      logger.log.trace({
        tx: true,
        container: inspect,
        durationSeconds: calculateDurationSeconds(start)
      }, 'Docker.prototype.inspectUserContainer inspectContainer success');
    }
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
  var logMessage = 'createContainer ' + keypather.get(opts, 'Labels.type');
  logger.log.trace({
    tx: true,
    opts: opts
  }, logMessage);
  var self = this;
  if (isFunction(opts)) {
    cb = opts;
    opts = {};
  }
  opts.Memory = process.env.CONTAINER_MEMORY_LIMIT_BYTES;
  var start = new Date();
  self.docker.createContainer(opts,
    function (err, response) {
      var duration =  calculateDurationSeconds(start);
      if (err) {
        logger.log.error({
          tx: true,
          durationSeconds: duration,
          labels: keypather.get(opts, 'Labels'),
          dockerHost: self.dockerHost,
          err: err
        }, 'createContainer error ' + keypather.get(opts, 'Labels.type'));
      }
      else {
        logger.log.trace({
          tx: true,
          durationSeconds: duration,
          labels: keypather.get(opts, 'Labels'),
          dockerHost: self.dockerHost,
          response: response
        }, 'createContainer success ' + keypather.get(opts, 'Labels.type'));
      }
      self.handleErr(callback, 'Create container failed',
                     { opts: opts }).apply(self, arguments);
    });
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
  logger.log.trace({
    tx: true,
    container: container
  }, 'inspectContainer');
  var containerId = container.dockerContainer || container.Id;
  var _this = this;
  var start = new Date();
  this.docker
    .getContainer(containerId)
    .inspect(function (err) {
      var duration = (new Date() - start) / 1000 | 0;
      if (err) {
        logger.log.error({
          tx: true,
          err: err,
          durationSeconds: duration,
          containerId: containerId
        }, 'Docker.prototype.inspectContainer inspect error');
      }
      else {
        logger.log.trace({
          tx: true,
          durationSeconds: duration,
          containerId: containerId
        }, 'Docker.prototype.inspectContainer inspect success');
      }
      _this.handleErr(cb, 'Inspect container failed',
                      { containerId: containerId }).apply(this, arguments);
    });
};

/**
 * attempts to start a stoped container
 * @param {String|Object} container - container object to start
 * @param {Object} opts
 * @param {Function} cb - Callback
 */
Docker.prototype.startContainer = function (container, opts, cb) {
  logger.log.trace({
    tx: true,
    container: container,
    opts: opts
  }, 'Docker.prototype.startContainer');
  var self = this;
  var containerId = isString(container) ?
    container : (container.dockerContainer || container.Id);
  if (isFunction(opts)) {
    cb = opts;
    opts = {};
  }
  var startInfo = {
    // contains keys
    //container: container,
    containerId: containerId,
    opts: opts
  };
  logger.log.trace(startInfo, 'Docker.prototype.startContainer startContainer startInfo');
  var start = new Date();
  self.docker
    .getContainer(containerId)
    .start(opts,
      function (err, response) {
        var duration = calculateDurationSeconds(start);
        if (err) {
          logger.log.error({
            tx: true,
            startInfo: startInfo,
            err: err,
            containerId: containerId,
            durationSeconds: duration
          }, 'Docker.prototype.startContainer startContainer error');
        }
        else {
          logger.log.info({
            tx: true,
            startInfo: startInfo,
            response: response,
            containerId: containerId,
            durationSeconds: duration
          }, 'Docker.prototype.startContainer startContainer success');
        }
        self.handleErr(cb, 'Start container failed',
                       { containerId: containerId, opts: opts })(err);
      });
};

/**
 * attempts to start a stoped container
 * @param container: container object to start
 * @param cb: Callback
 */
Docker.prototype.restartContainer = function (container, cb) {
  logger.log.trace({
    tx: true,
    container: container
  }, 'Docker.prototype.restartContainer');
  var self = this;
  var containerId = container.dockerContainer || container.Id;
  var start = new Date();
  self.docker
    .getContainer(containerId)
    .restart({},
      function (err, response) {
        var duration = calculateDurationSeconds(start);
        if (err) {
          logger.log.error({
            tx: true,
            durationSeconds: duration,
            err: err,
            containerId: containerId
          }, 'Docker.prototype.restartContainer restartContainer error');
        }
        else {
          logger.log.trace({
            tx: true,
            durationSeconds: duration,
            containerId: containerId,
            response: response
          }, 'Docker.prototype.restartContainer restartContainer success');
        }
        self.handleErr(cb,
                       'Restart container failed',
                       { containerId: containerId }).apply(self, arguments);
      });
};

/**
 * attempts to stop a running container.
 * if not stopped in passed in time, the process is kill 9'd
 * @param container  docker container or mongo container object
 * @param force      Force stop a container. Ignores 'already stopped' error.
 * @param cb         callback
 */
Docker.prototype.stopContainer = function (container, force, cb) {
  logger.log.trace({
    container: container,
    force: force,
    tx: true
  }, 'stopContainer');
  if (isFunction(force)) {
    cb = force;
    force = false;
  }
  var self = this;
  var containerId = container.dockerContainer || container.Id;
  var opts = {
    t: process.env.CONTAINER_STOP_LIMIT
  };
  var start = new Date();
  self.docker
    .getContainer(containerId)
    .stop(opts,
      function (err, response) {
        var duration = (new Date() - start) / 1000 | 0;
        if (err) {
          logger.log.error({
            tx: true,
            err: err,
            durationSeconds: duration,
            containerId: containerId
          }, 'stopContainer error');
        }
        else {
          logger.log.trace({
            tx: true,
            containerId: containerId,
            durationSeconds: duration,
            response: response
          }, 'stopContainer success');
        }
        self.handleErr(callback, 'Stop container failed',
          { opts: opts, containerId: containerId }).apply(self, arguments);
      });

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
  logger.log.trace({
    tx: true,
    container: container
  }, 'removeContainer');
  var self = this;
  var containerId = container.dockerContainer || container.Id;
  var start = new Date();
  self.docker
    .getContainer(containerId)
    .remove({},
      function (err, response) {
        var duration = (new Date() - start) / 1000 | 0;
        if (err) {
          logger.log.error({
            tx: true,
            durationSeconds: duration,
            err: err,
            containerId: containerId
          }, 'removeContainer error');
        }
        else {
          logger.log.trace({
            tx: true,
            durationSeconds: duration,
            containerId: containerId,
            response: response
          }, 'removeContainer success');
        }
        self.handleErr(cb, 'Remove container failed',
                       { containerId: containerId }).apply(self, arguments);
      });
};

/**
 * stop an array of containers
 * @param containers: array of container objects kill
 * @param force: Force stop a container. Ignores 'already stopped' error.
 * @param cb: Callback
 */
Docker.stopContainers = function (containers, force, cb) {
  logger.log.trace({
    tx: true
  }, 'stopContainers');
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
      docker.stopContainer(container, force, function (err) {
        if (err) {
          logger.log.error({
            tx: true,
            err: err,
            container: container
          }, 'stopContainers error');
        }
        else {
          logger.log.trace({
            tx: true,
            container: container
          }, 'stopContainers success');
        }
        cb();
      });
    }, cb);

};

/**
 * removes an array of containers
 * @param containers  array of container objects to remove
 * @param cb          callback(err)
 */
Docker.removeContainers = function (containers, cb) {
  logger.log.trace({
    tx: true
  }, 'removeContainers');
  if (!Array.isArray(containers)) {
    containers = [containers];
  }
  async.map(
    containers,
    function (container, cb) {
      var docker = new Docker(container.dockerHost);
      docker.removeContainer(container, function (err) {
        if (err) {
          logger.log.error({
            tx: true,
            err: err,
            container: container
          }, 'removeContainers error');
        }
        else {
          logger.log.trace({
            tx: true,
            container: container
          }, 'removeContainers success');
        }
        cb();
      });
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
        dogstatsd.increment('api.docker.handleErr.codes', 1, [
          'code:'+code,
          'host:'+self.dockerHost
        ]);
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
