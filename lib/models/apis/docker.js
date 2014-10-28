'use strict';

var async = require('async');
var debug = require('debug')('runnable-api:docker:model');
var Dockerode = require('dockerode');
var error = require('error');
var url = require('url');
var dogerode = require('dogerode');
var Boom = require('dat-middleware').Boom;
var join = require('path').join;
var Mavis = require('models/apis/mavis');
var utils = require('middlewares/utils');
var extend = require('extend');
var isFunction = require('101/is-function');
var streamCleanser = require('docker-stream-cleanser');

module.exports = Docker;

function Docker (dockerHost) {
  if (!dockerHost) {
    throw new Error('dockerHost required');
  }
  var parsed = ~dockerHost.indexOf('http:') ?
    url.parse(dockerHost) :
    url.parse('http://'+dockerHost);
  this.dockerHost = parsed.protocol +'//'+ parsed.host;
  this.port = parsed.port || 4243;
  this.docker = dogerode(new Dockerode({
    host: this.dockerHost,
    port: this.port
  }), {
    service: 'api',
    host: process.env.DATADOG_HOST,
    port: process.env.DATADOG_PORT
  });
}

/**
 * Get environment variables for image-builder container run
 * @return {array} env strings
 */
function getEnvForImageBuilder (version, dockerTag) {
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
    'RUNNABLE_DOCKERTAG='      + dockerTag
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

  return env;
}

/**
 * Create image-builder container and attach to it.
 * @param  {User          }  sessionUser user creating the container
 * @param  {ContextVersion}  version     contextVersion that needs to be built
 * @param  {Function      }  cb          callback(err, container, dockerTag, stream)
 */
// FIXME: error handling
Docker.prototype.createImageBuilderAndAttach = function (sessionUser, version, cb) {
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
    var dockerTag = join(
      'registry.runnable.com/',
      sessionUser.accounts.github.id.toString(),
      version.context + ':' + version._id);

    var self = this;
    debug('create container');
    self.createContainer({
      Image: 'runnable/image-builder:' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
      Env  : getEnvForImageBuilder(version, dockerTag)
    }, function (err, container) {
      debug('container created - ', 'err:', err, 'container:', container);
      if (err) { return cb(err); }
      var containerId = container.Id;

      version.update({
        $set: { containerId: containerId }
      }, error.logIfErr);

      cb(null, container);
    });
  }
};

/**
 * Start the image builder container and wait for it's logs
 * @param  {User          } sessionUser user creating the container
 * @param  {ContextVersion} version     contextVersion that needs to be built
 * @param  {Container     } container   dockerode container (image builder container)
 * @param  {Function      } cb          callback(err, container, stream)
 */
// FIXME: error handling
/*jshint maxcomplexity:6*/
var successRe = /Successfully built ([a-f0-9]+)/;
Docker.prototype.startImageBuilderAndWait = function (sessionUser, version, container, cb) {
  var self = this;
  var dockerTag = join(
    'registry.runnable.com/',
    sessionUser.accounts.github.id.toString(),
    version.context + ':' + version._id);
  var binds = [
    '/var/run/docker.sock:/var/run/docker.sock'
  ];
  debug('create container');

  self.startContainer(container, { Binds: binds }, function (err) {
    debug('container created - ', 'err:', err);
    if (err) {
      return self.handleError(cb, 'docker start failed', { containerId: container.Id })(err);
    }
    container.wait(function (err, res) {
      debug('get build logs');
      container.logs({
        follow: false,
        stdout: true,
        stderr: true
      }, function (err, stream) {
        debug('build logs recieved - ', 'err:', err);
        if (err) {
          return self.handleError(cb, 'docker logs failed', { containerId: container.Id })(err);
        }
        streamCleanser.async(stream, function (result) {
          if (!result) {
            return cb(Boom.badRequest('Docker Stream Cleanser failed ',
              { docker: {
                containerId: container.Id,
                versionId: version._id
              }}));
          }
          var buildLogData = result.toString();
          if (err) {
            return self.handleError(cb, 'docker wait failed',
              { docker: {
                containerId: container.Id,
                versionId: version._id,
                log: buildLogData
              }})(err);
          }
          var match = successRe.exec(buildLogData);
          var buildFailed = !match || !match[1];
          if (buildFailed || (res && res.StatusCode)) {
            debug('build failed - ', res, buildLogData);
            cb(Boom.badRequest('Build Failed: Dockerfile error code: ' + res.StatusCode,
              { docker: {
                containerId: container.Id,
                versionId: version._id,
                log: buildLogData
              }}));
          } else {
            debug('build success');
            cb(null, {
              dockerImage: match[1],
              dockerTag: dockerTag,
              buildLog: buildLogData,
              dockerHost: self.dockerHost,
              versionId: version._id
            });
            // var split = dockerTag.split(':');
            // FIXME: hangs in tests, bc nock is not working
            // var imageName = split[0];
            // var imageTag  = split[1];
            // self.pushImageToRegistry(imageName, imageTag);
          }
        });
      });
    });
  });
};

/*jshint maxcomplexity:5*/
Docker.prototype.pushImageToRegistry = function (imageName, tag, cb) {
  if (!cb) {
    cb = error.logIfErr;
  }
  this.docker
    .getImage(imageName)
    .push({ tag: tag }, cb);
};

/**
 * This function fetches a container, queries Docker for it's logs, and sends them to the supplied
 * callback
 * @param containerId Id of the container to grab logs from
 * @param tail count
 * @param cb Callback to send the log stream back to
 */
Docker.prototype.getLogs = function (containerId, tail, cb) {
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



Docker.prototype.createAndInspectContainer = function (version, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  // Create opts
  opts.create = opts.create || {};
  extend(opts.create, {
    Image: version.build.dockerImage
  });
  // Start opts
  // FIXME: HACK: used to make privileged containers based on repos
  var self = this;
  var privilegedRepos = ['CodeNow/krain'];
  var sudo = version.appCodeVersions.some(function (acv) {
    return ~privilegedRepos.indexOf(acv.repo);
  });
  opts.start = opts.start || {};
  extend(opts.start, {
    PublishAllPorts: true,
    Privileged: sudo
  });

  async.waterfall([
    createContainer,
    startContainer,
    inspectContainer
  ], cb);
  function createContainer (cb) {
    self.createContainer(opts.create, cb);
  }
  function startContainer (container, cb) {
    self.startContainer(container, opts.start, function (err) {
      cb(err, container);
    });
  }
  function inspectContainer (container, cb) {
    self.inspectContainer(container, cb);
  }
};

Docker.prototype.createContainerForVersion = function (version, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  if (!version.build || !version.build.dockerImage) {
    return cb(Boom.badRequest('Cannot create a container for an unbuilt version', {
      debug: { versionId: version._id.toString() }
    }));
  }
  var self = this;
  this.createAndInspectContainer(version, opts, function (err, inspect) {
    if (err) { return cb(err); }
    inspect.dockerHost = self.dockerHost;
    cb(null, inspect);
  });
};

Docker.createContainersForVersions = function (versions, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  async.map(versions,
    function (version, cb) {
      var mavis = new Mavis();
      mavis.findDock('container_run', version.dockerHost, function (err, dockerHost) {
        if (err) { return cb(err); }

        var docker = new Docker(dockerHost);
        version.update({
          $set: { dockerHost: dockerHost }
        }, function (err) {
          if (err) { return cb(err); }
          docker.createContainerForVersion(version, opts, cb);
        });
      });
    }, cb);
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
  var self = this;
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  self.docker.createContainer(opts,
    self.handleError(callback, 'Error creating container', { opts: opts }));
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
  var containerId = container.dockerContainer || container.Id;
  this.docker
    .getContainer(containerId)
    .inspect(this.handleError(cb, 'Error inspecting container', { containerId: containerId }));
};

/**
 * attempts to start a stoped container
 * @param container: container object to start
 * @param cb: Callback
 */
Docker.prototype.startContainer = function (container, opts, cb) {
  var self = this;
  var containerId = container.dockerContainer || container.Id;
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  self.docker
    .getContainer(containerId)
    .start(opts,
      self.handleError(cb, 'Error starting container', { containerId: containerId, opts: opts }));
};

/**
 * attempts to start a stoped container
 * @param container: container object to start
 * @param cb: Callback
 */
Docker.prototype.restartContainer = function (container, cb) {
  var self = this;
  var containerId = container.dockerContainer || container.Id;
  self.docker
    .getContainer(containerId)
    .restart({},
      self.handleError(cb, 'Error restarting container', { containerId: containerId }));
};

/**
 * attempts to stop a running container.
 * if not stoped in passed in time, the process is kill 9'd
 * @param container  docker container or mongo container object
 * @param force      Force stop a container. Ignores 'already stopped' error.
 * @param cb         callback
 */
Docker.prototype.stopContainer = function (container, force, cb) {
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
      self.handleError(callback, 'Error stopping container',
        { opts: opts, containerId: containerId }));

  function callback (err) {
    if (err && (!force || err.output.statusCode >= 400)) {
      // if hardstop ignore "already stopped" error
      return cb(err);
    }
    var args = Array.prototype.slice.call(arguments);
    args[0] = null; // ignore err
    cb.apply(null, args);
  }
};

/**
 * attempts to remove a non-running container.
 * if the container is running, an error should be thrown
 * @param container docker container or mongo container object
 * @param cb        callback(err)
 */
Docker.prototype.removeContainer = function (container, cb) {
  var self = this;
  var containerId = container.dockerContainer || container.Id;
  self.docker
    .getContainer(containerId)
    .remove({},
      self.handleError(cb, 'Error removing container', { containerId: containerId }));
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
  var self = this;
  async.map(
    containers,
    function (container, cb) {
      var docker = new Docker(container.dockerHost);
      var containerId = container.dockerContainer;
      docker.removeContainer(container,
        self.handleError(cb, 'Error removing container', { containerId: containerId }));
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
Docker.prototype.handleError = function (cb, errMessage, errDebug) {
  var self = this;
  /*jshint maxcomplexity:10*/
  return function (err) {
    if (err) {
      error.log(err);
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

      var message = err.reason ?
        errMessage+': '+err.reason :
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
