/**
 * TODO: Document
 * @module lib/models/apis/docker
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var Dockerode = require('dockerode');
var JSONStream = require('JSONStream');
var async = require('async');
var createStreamCleanser = require('docker-stream-cleanser');
var defaults = require('101/defaults');
var dogerode = require('dogerode');
var domain = require('domain');
var error = require('error');
var exists = require('101/exists');
var extend = require('101/assign');
var fs = require('fs');
var isFunction = require('101/is-function');
var isObject = require('101/is-object');
var join = require('path').join;
var keypather = require('keypather')();
var pick = require('101/pick');
var put = require('101/put');
var url = require('url');

var dogstatsd = require('models/datadog');
var logger = require('middlewares/logger')(__filename);
var utils = require('middlewares/utils');

var log = logger.log;

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
  log.warn({err: e}, 'cannot load certificates for docker!!');
  // use all or none - so reset certs here
  certs = {};
}

module.exports = Docker;

/**
 * @param {String} dockerHost
 * @param {Object} opts - additonal docker options
 */
function Docker (dockerHost, opts) {
  opts = opts || {};
  this.logData = {
    tx: true,
    dockerHost: dockerHost
  };
  log.info(this.logData, 'Docker constructor');
  if (!dockerHost) {
    throw new Error('dockerHost required');
  }
  var parsed = ~dockerHost.indexOf('http:') ?
    url.parse(dockerHost) :
    url.parse('http://'+dockerHost);
  this.dockerHost = parsed.protocol +'//'+ parsed.host;
  this.port = parsed.port;
  var dockerodeOpts = defaults(opts, {
    host: this.dockerHost,
    port: this.port,
    timeout: process.env.API_DOCKER_TIMEOUT
  });
  extend(dockerodeOpts, certs);
  this.docker = dogerode(new Dockerode(dockerodeOpts), {
    service: 'api',
    host: process.env.DATADOG_HOST,
    port: process.env.DATADOG_PORT
  });
}

/**
 * get docker tag url
 * @param  {object} sessionUser user mongo model
 * @param  {object} version     version mongo model
 * @return {string}             dockerUrl
 */
Docker.getDockerTag = function (sessionUser, version) {
  return join(
    process.env.REGISTRY_DOMAIN + '/',
    sessionUser.accounts.github.id.toString(),
    version.context + ':' + version._id);
};

/**
 * @param {Object} opts
 * @param {Boolean} opts.manualBuild - Boolean indicating automatic or manual build
 * @param {Object} opts.sessionUser - Currently authenticated user
 * @param {Object} opts.contextVersion - contextVersion to be built
 * @param {String} opts.dockerTag - Tag to give image created by image-builder
 * @param {Object} opts.network - Object containing container network information
 * @param {Boolean} opts.noCache -
 * @param {String} opts.tid - TID value to place on labels
 */
Docker.prototype.createImageBuilder = function (opts, cb) {
  var logData = {
    tx: true,
    opts: opts
  };
  log.info(logData, 'Docker.prototype.createImageBuilder');
  var validationError = this._createImageBuilderValidateCV(opts.contextVersion);
  if (validationError) {
    return cb(validationError);
  }
  var buildContainerLabels = this._createImageBuilderLabels({
    contextVersion: opts.contextVersion,
    dockerTag: opts.dockerTag,
    manualBuild: opts.manualBuild,
    network: opts.network,
    noCache: opts.noCache,
    sessionUser: opts.sessionUser,
    tid: opts.tid
  });
  var builderContainerData = {
    name: opts.contextVersion.build._id.toString(),
    Image: process.env.DOCKER_IMAGE_BUILDER_NAME + ':' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
    Env: this._createImageBuilderEnv({
      dockerTag: opts.dockerTag,
      hostIp: opts.network.hostIp,
      networkIp: opts.network.networkIp,
      noCache: opts.noCache,
      sauronHost: url.parse(this.dockerHost).hostname+':'+process.env.SAURON_PORT,
      contextVersion: opts.contextVersion
    }),
    Binds: [],
    Volumes: {},
    Labels: buildContainerLabels
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
  this.createContainer(builderContainerData, cb);
};

/**
 * Validate ContextVersion should be built
 * @param {Object} contextVersion
 * @return {Object || null}
 */
Docker.prototype._createImageBuilderValidateCV = function (contextVersion) {
  var logData = { tx: true, contextVersion: contextVersion };
  log.info(logData, 'Docker.prototype._createImageBuilderValidateCV');
  if (contextVersion.build.completed) {
    log.error(logData, '_createImageBuilderValidateCV build completed');
    return Boom.conflict('Version already built', contextVersion);
  }
  if (!contextVersion.infraCodeVersion) {
    log.error(logData, '_createImageBuilderValidateCV no icv');
    return Boom.badRequest('Cannot build a version without a Dockerfile', contextVersion);
  }
  if (utils.isObjectId(contextVersion.infraCodeVersion)) {
    log.error(logData, '_createImageBuilderValidateCV not populated icv');
    return Boom.badRequest('Populate infraCodeVersion before building it', contextVersion);
  }
};

/**
 * Create labels hash for image builder container
 * @param {Object} opts.contextVersion
 * @param {String} opts.dockerTag
 * @param {Object} opts.network
 * @param {Boolean} opts.manualBuild
 * @param {Boolean} opts.noCache
 * @param {Object} opts.sessionUser
 * @param {String} opts.tid
 * @return {Object} image builder container labels
 */
Docker.prototype._createImageBuilderLabels = function (opts) {
  log.info(this.logData, 'Docker.prototype._createImageBuilderLabels');
  var flattenedContextVersion = keypather.flatten(
    opts.contextVersion.toJSON(), '.', 'contextVersion');
  var buildContainerLabels = put(flattenedContextVersion, {
    dockerTag: opts.dockerTag,
    hostIp: opts.network.hostIp,
    manualBuild: opts.manualBuild,
    networkIp: opts.network.networkIp,
    noCache: opts.noCache,
    sauronHost: url.parse(this.dockerHost).hostname+':'+process.env.SAURON_PORT,
    sessionUserDisplayName: opts.sessionUser.accounts.github.displayName,
    sessionUserGithubId: opts.sessionUser.accounts.github.id,
    sessionUserUsername: opts.sessionUser.accounts.github.username,
    tid: opts.tid,
    type: 'image-builder-container'
  });
  Object.keys(buildContainerLabels).forEach(function (key) {
    if (keypather.get(buildContainerLabels, key+'.toString')) {
      buildContainerLabels[key] = buildContainerLabels[key].toString();
    }
    else {
      buildContainerLabels[key] = ''+buildContainerLabels[key];
    }
  });
  log.trace(put({
    buildContainerLabels: buildContainerLabels
  }, this.logData), '_createImageBuilderLabels buildContainerLabels');
  return buildContainerLabels;
};

/**
 * Get environment variables for image-builder container run
 * @return {array} env strings
 */
Docker.prototype._createImageBuilderEnv = function (opts) {
  log.info(this.logData, 'Docker.prototype._createImageBuilderEnv');
  var contextVersion = opts.contextVersion;
  var dockerTag = opts.dockerTag;

  var infraCodeVersion = contextVersion.infraCodeVersion;
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
  contextVersion.appCodeVersions.forEach(function (acv) {
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
  env.push('RUNNABLE_PUSH_IMAGE=true');

  return env;
};

/**
 * Start the image builder container and wait for it's logs
 * @param {String} containerId - image-builder container (dockerode) or containerId
 * @param {Function} cb - callback(err, container, stream)
 */
// FIXME: error handling
/*jshint maxcomplexity:6*/
var successRe = /Successfully built ([a-f0-9]+)/;
Docker.prototype.startImageBuilderContainer = function (containerId, cb) {
  log.info({
    tx: true,
    containerId: containerId
  }, 'Docker.prototype.startImageBuilderContainer');
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
  this.startContainer(containerId, startContainerData, cb);
};

/**
 * should return all build info. logs, tag,
 * @param {String} containerId
 * @param {Function} cb
 */
Docker.prototype.getBuildInfo = function(containerId, cb) {
  var logData = {
    tx: true,
    containerId: containerId
  };
  log.info(logData, 'Docker.prototype.getBuildInfo');
  var self = this;
  var container = self.docker.getContainer(containerId);
  container.logs({
    follow: false,
    stdout: true,
    stderr: true
  }, function (err, stream) {
    log.trace(put({err: err}, logData), 'getBuildInfo build logs received');
    var errDebug = { containerId: containerId };
    if (err) {
      log.error(put({err: err}, logData), 'getBuildInfo error');
      return self.handleErr(cb, 'docker logs failed', errDebug)(err);
    }
    var streamCleanser = createStreamCleanser();
    stream.on('error',
      self.handleErr(cb, 'docker logs stream failed', errDebug));
    streamCleanser.on('error',
      self.handleErr(cb, 'docker stream cleanser failed', errDebug));

    var pipeDomain = domain.create();
    pipeDomain.on('error', function (err) {
      log.fatal(put({err: err}, logData), 'Docker.prototype.getBuildInfo: domain err');
      error.log(err);
      self.handleErr(cb, 'json parse failed')(err);
    });

    var logArr = [];
    pipeDomain.run(function () {
      var jsonParser = JSONStream.parse();
      log.info(logData, 'Docker.prototype.getBuildInfo: begin pipe job');

      jsonParser.on('root', onRootEvent);
      jsonParser.on('error', onErrorEvent);
      jsonParser.on('end', onEndEvent);

      function onRootEvent (data) {
        if (!isObject(data)) { data = {}; }
        logArr.push(data);
      }
      function onErrorEvent (jsonParseErr) {
        jsonParser.removeListener('root', onRootEvent);
        jsonParser.removeListener('error', onErrorEvent);
        jsonParser.removeListener('end', onEndEvent);
        var message = jsonParseErr.message;
        self.handleErr(cb, 'json parse failed to read build logs: ' + message)(jsonParseErr);
      }
      function onEndEvent () {
        logger.log.trace(logData, 'build logs cleansed');
        var match;
        for (var i = logArr.length - 1; i >= 0; --i) {
          match = successRe.exec(logArr[i].content);
          if (match) { break; }
        }
        var buildFailed = !match || !match[1];
        var image = buildFailed ? null : match[1];
        cb(null, {
          dockerImage: image,
          log: logArr,
          failed: buildFailed
        });
      }

      stream
        .pipe(streamCleanser)
        .pipe(jsonParser);
    });
  });
};

/**
 * This function fetches a container, queries Docker for it's logs, and sends them to the supplied
 * callback
 * @param {String} containerId Id of the container to grab logs from
 * @param {String} tail count
 * @param {Function} cb Callback to send the log stream back to
 */
Docker.prototype.getLogs = function (containerId, tail, cb) {
  if (typeof tail === 'function') {
    cb = tail;
    tail = 'all';
  }
  var logData = {
    tx: true,
    containerId: containerId,
    tail: tail
  };
  log.info(logData, 'Docker.prototype.getLogs');
  var self = this;
  var container = this.docker.getContainer(containerId);
  if (!container) {
    log.error(logData, 'Docker.prototype.getLogs error, container not created');
    return cb(new Error('The requested container has not been created'));
  }
  // With the container, we can request the logs
  // TODO: add max length of log lines to tail
  container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: tail },
    function (err) {
      if (err) {
        log.error(put({
          err: err
        }, logData), 'Docker.prototype.getLogs: error');
      }
      else {
        log.trace(logData, 'Docker.prototype.getLogs: success');
      }
      self.handleErr(cb, 'Get logs  failed',
                      { containerId: containerId }).apply(this, arguments);
    });
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
  'creatorGithubId',
  'ownerGithubId'
];
Docker.prototype.createUserContainer = function (version, opts, cb) {
  log.info({
    tx: true,
    version: version,
    opts: opts
  }, 'Docker.prototype.createUserContainer');
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
 * @param {String} container - container object to start
 * @param {Object} opts - opts to pass to docker
 * @param {Function} cb - Callback
 */
Docker.prototype.startUserContainer = function (containerId, ownerId, opts, cb) {
  var logData = {
    tx: true,
    containerId: containerId,
    opts: opts,
    elapsedTimeSeconds: new Date()
  };
  log.info(logData, 'Docker.prototype.startUserContainer');
  if (isFunction(opts)) {
    cb = opts;
    opts = {};
  }
  opts = put(opts, { PublishAllPorts: true });
  this.startContainer(containerId, opts, function (err) {
    if (err) {
      log.error(put({
        err: err
      }, logData), 'startUserContainer: error');
    }
    else {
      log.trace(logData, 'startUserContainer: success');
    }
    cb.apply(this, arguments);
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
  log.info({
    tx: true,
    opts: opts
  }, 'Docker.prototype.createContainer');
  var self = this;
  if (isFunction(opts)) {
    cb = opts;
    opts = {};
  }
  opts.Memory = process.env.CONTAINER_MEMORY_LIMIT_BYTES;
  var start = new Date();
  self.docker.createContainer(opts,
    function (err, response) {
      if (err) {
        log.error({
          tx: true,
          elapsedTimeSeconds: start,
          labels: keypather.get(opts, 'Labels'),
          dockerHost: self.dockerHost,
          err: err
        }, 'Docker.prototype.createContainer error ' + keypather.get(opts, 'Labels.type'));
      }
      else {
        log.trace({
          tx: true,
          elapsedTimeSeconds: start,
          labels: keypather.get(opts, 'Labels'),
          dockerHost: self.dockerHost,
          response: response
        }, 'Docker.prototype.createContainer success ' + keypather.get(opts, 'Labels.type'));
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
 * docker inspect container
 * @param {String} containerId - docker container Id
 * @param {Function} cb
 */
Docker.prototype.inspectContainer = function (containerId, cb) {
  log.info({
    tx: true,
    containerId: containerId
  }, 'Docker.prototype.inspectContainer');
  var self = this;
  var start = new Date();
  this.docker
    .getContainer(containerId)
    .inspect(function (err) {
      if (err) {
        log.error({
          tx: true,
          err: err,
          elapsedTimeSeconds: start,
          containerId: containerId
        }, 'Docker.prototype.inspectContainer inspect error');
      }
      else {
        log.trace({
          tx: true,
          elapsedTimeSeconds: start,
          containerId: containerId
        }, 'Docker.prototype.inspectContainer inspect success');
      }
      self.handleErr(cb, 'Inspect container failed',
                      { containerId: containerId }).apply(this, arguments);
    });
};

/**
 * attempts to start a stoped container
 * @param {String} containerId - container object to start
 * @param {Object} opts
 * @param {Function} cb - Callback
 */
Docker.prototype.startContainer = function (containerId, opts, cb) {
  log.info({
    tx: true,
    containerId: containerId,
    opts: opts
  }, 'Docker.prototype.startContainer');
  var self = this;
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
  log.trace(startInfo, 'Docker.prototype.startContainer startContainer startInfo');
  var start = new Date();
  self.docker
    .getContainer(containerId)
    .start(opts,
      function (err, response) {
        if (err) {
          log.error({
            tx: true,
            startInfo: startInfo,
            err: err,
            containerId: containerId,
            elapsedTimeSeconds: start
          }, 'Docker.prototype.startContainer startContainer error');
        }
        else {
          log.info({
            tx: true,
            startInfo: startInfo,
            response: response,
            containerId: containerId,
            elapsedTimeSeconds: start
          }, 'Docker.prototype.startContainer startContainer success');
        }
        self.handleErr(cb, 'Start container failed',
                       { containerId: containerId, opts: opts })(err);
      });
};

/**
 * attempts to start a stoped container
 * @param {String} containerId
 * @param {Function} cb
 */
Docker.prototype.restartContainer = function (containerId, cb) {
  log.info({
    tx: true,
    containerId: containerId
  }, 'Docker.prototype.restartContainer');
  var self = this;
  var start = new Date();
  self.docker
    .getContainer(containerId)
    .restart({},
      function (err, response) {
        if (err) {
          log.error({
            tx: true,
            elapsedTimeSeconds: start,
            err: err,
            containerId: containerId
          }, 'Docker.prototype.restartContainer restartContainer error');
        }
        else {
          log.trace({
            tx: true,
            elapsedTimeSeconds: start,
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
 * @param {String} containerId
 * @param {Boolean} force Force stop a container. Ignores 'already stopped' error.
 * @param {Function} cb
 */
Docker.prototype.stopContainer = function (containerId, force, cb) {
  var logData = {
    containerId: containerId,
    force: force,
    tx: true
  };
  log.info(logData, 'Docker.prototype.stopContainer');
  if (isFunction(force)) {
    cb = force;
    force = false;
  }
  var self = this;
  var opts = {
    t: process.env.CONTAINER_STOP_LIMIT
  };
  var start = new Date();
  self.docker
    .getContainer(containerId)
    .stop(opts,
      function (err, response) {
        if (err) {
          log.error(put({
            elapsedTimeSeconds: start,
            err: err
          }, logData), 'stopContainer error');
        }
        else {
          log.trace(put({
            elapsedTimeSeconds: start,
            response: response
          }, logData), 'stopContainer success');
        }
        self.handleErr(callback, 'Stop container failed',
          { opts: opts, containerId: containerId }).apply(self, arguments);
      });

  function callback (err) {
    // ignore "already stopped" error (304 not modified)
    if (err && (!force && notModifiedError(err))) {
      log.info(logData, 'stopContainer callback already-stoped error');
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
 * @param {String} containerId
 * @param {Function} cb
 */
Docker.prototype.removeContainer = function (containerId, cb) {
  log.info({
    tx: true,
    containerId: containerId
  }, 'Docker.prototype.removeContainer');
  var self = this;
  var start = new Date();
  self.docker
    .getContainer(containerId)
    .remove({},
      function (err, response) {
        if (err) {
          log.error({
            tx: true,
            elapsedTimeSeconds: start,
            err: err,
            containerId: containerId
          }, 'removeContainer error');
        }
        else {
          log.trace({
            tx: true,
            elapsedTimeSeconds: start,
            containerId: containerId,
            response: response
          }, 'removeContainer success');
        }
        self.handleErr(cb, 'Remove container failed',
                       { containerId: containerId }).apply(self, arguments);
      });
};

/**
 * CONTAINER METHODS - END
 */

/**
 * IMAGE METHODS - START
 */

/**
 * pulls docker image from registry
 * will return once pulling is completed
 * @param  {string}   imageId id of image to push to registry
 *                            format: registry.runnable.com/123/456:<tag>
 * @param  {Function} cb      (err)
 */
Docker.prototype.pullImage = function (imageId, cb) {
  log.info({
    tx: true,
    imageId: imageId
  }, 'Docker.prototype.pullImage');
  var self = this;
  self.docker.pull(imageId, function (err, pullStream) {
    if (err) {
      log.error({
        tx: true,
        imageId: imageId,
        err: err
      }, 'Docker.prototype.pullImage docker.pull error');
      return cb(err);
    }
    log.trace({
      tx: true,
      imageId: imageId
    }, 'Docker.prototype.pullImage docker.pull success');
    self.docker.modem.followProgress(pullStream, cb);
  });
};

/**
 * IMAGE METHODS - END
 */

/**
  Create copy of original Docker method but with special first options agrument.
  First option argument may have 3 keys:
    - times - number of times original method should be called/retried in case of error
    - interval - how long to wait between attempts
    - ignoreStatusCode - original error status code
           that can be counted as success (no retries would be
  Following methods are available:
    - inspectContainerWithRetry
    - removeContainerWithRetry
    - stopContainerWithRetry
*/
[
  'inspectContainer',
  'removeContainer',
  'stopContainer',
  'createImageBuilder',
  'startImageBuilderContainer',
  'startUserContainer'
].forEach(function (method) {
  var newMethodName = method + 'WithRetry';
  Docker.prototype[newMethodName] = function () {
    var self = this;
    var args = Array.prototype.slice.call(arguments);
    log.info({tx: true, args: args}, 'Docker.prototype.' + newMethodName);
    // first argument should be method options
    var opts = args.shift();
    var retryOpts = pick(opts, ['times', 'interval']);
    var finalCb = args.pop();
    var attemptCount = 0;

    async.retry(retryOpts, function (cb) {
      attemptCount++;
      // clone args. we need clone since we do modification on each retry iteration
      var cbArgs = args.slice();
      var retryCb = function (err, result) {
        attemptCount++;
        if (err) {
          log.error({
            tx: true,
            err: err,
            attemptCount: attemptCount
          }, method + ' attempt failure');
          // we shouldn't retry on some specific error codes
          var errStatusCode = keypather.get(err, 'output.statusCode') || err.statusCode;
          if (opts.ignoreStatusCode && opts.ignoreStatusCode === errStatusCode) {
            log.info({
              tx: true,
              err: err,
              attemptCount: attemptCount
            }, method + ' no retry call:' + err.statusCode);
            return cb(null);
          }
        }
        else {
          log.trace({
            tx: true,
            result: result,
            attemptCount: attemptCount
          }, method + ' attempt success');
        }
        cb.apply(this, arguments);
      };
      cbArgs.push(retryCb);
      self[method].apply(self, cbArgs);
    }, function (err) {
      if (err) {
        log.warn({
          tx: true,
          err: err,
          attemptCount: attemptCount
        }, method + ' final failure');
      }
      else {
        log.trace({
          tx: true,
          err: err,
          attemptCount: attemptCount
        }, method + ' final success');
      }
      finalCb.apply(this, arguments);
    });
  };
});

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
