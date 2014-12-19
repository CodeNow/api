'use strict';

var async = require('async');
var debug = require('debug')('runnable-api:docker:model');
var Dockerode = require('dockerode');
var error = require('error');
var url = require('url');
var dogerode = require('dogerode');
var Boom = require('dat-middleware').Boom;
var join = require('path').join;
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
 * get docker tag url
 * @param  {object} sessionUser user mongo model
 * @param  {object} version     version mongo model
 * @return {string}             dockerUrl
 */
function getDockerTag (sessionUser, version) {
  return join(
    process.env.REGISTRY_DOMAIN + '/',
    sessionUser.accounts.github.id.toString(),
    version.context + ':' + version._id);
}

/**
 * Create image-builder container and attach to it.
 * @param  {User          }  sessionUser user creating the container
 * @param  {ContextVersion}  version     contextVersion that needs to be built
 * @param  {Function      }  cb          callback(err, container, dockerTag, stream)
 */
// FIXME: error handling
Docker.prototype.createImageBuilderAndAttach = function (sessionUser, version, cb) {
  debug('createImageBuilderAndAttach', formatArgs(arguments));
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
    var dockerTag = getDockerTag(sessionUser, version);
    var self = this;
    debug('create container');
    var builderContainerData = {
      Image: process.env.DOCKER_IMAGE_BUILDER_NAME + ':' + process.env.DOCKER_IMAGE_BUILDER_VERSION,
      Env  : getEnvForImageBuilder(version, dockerTag),
      Binds: []
    };
    if (process.env.DOCKER_IMAGE_BUILDER_CACHE) {
      builderContainerData.Binds.push(process.env.DOCKER_IMAGE_BUILDER_CACHE + ':/cache:rw');
      builderContainerData.Volumes = {
        '/cache': {}
      };
    }
    self.createContainer(builderContainerData, function (err, container) {
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
  debug('startImageBuilderAndWait', formatArgs(arguments));
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
  self.startContainer(container, startContainerData, function (err) {
    debug('container created - ', 'err:', err);
    if (err) { return cb(err); } // already a boom error
    container.wait(function (err, res) {
      if (err) {
        return self.handleErr(cb, 'docker wait failed', { containerId: container.Id })(err);
      }
      debug('get build logs');
      container.logs({
        follow: false,
        stdout: true,
        stderr: true
      }, function (err, stream) {
        debug('build logs recieved - ', 'err:', err);
        if (err) {
          return self.handleErr(cb, 'docker logs failed', { containerId: container.Id })(err);
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
            return self.handleErr(cb, 'docker wait failed',
              { docker: {
                containerId: container.Id,
                versionId: version._id,
                log: buildLogData
              }})(err);
          }
          var match = successRe.exec(buildLogData);
          var buildFailed = !match || !match[1];
          var dockerTag = getDockerTag(sessionUser, version);
          if (buildFailed || res.StatusCode) {
            debug('build failed - ', res, buildLogData);
            cb(Boom.badRequest('Build Failed: Dockerfile error code: ' + res.StatusCode,
              { docker: {
                containerId: container.Id,
                versionId: version._id,
                dockerTag: dockerTag,
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
            var split = dockerTag.split(':');
            var imageName = split[0];
            var imageTag  = split[1];
            self.pushImageToRegistry(imageName, imageTag);
          }
        });
      });
    });
  });
};

/*jshint maxcomplexity:5*/
Docker.prototype.pushImageToRegistry = function (imageName, tag, cb) {
  debug('pushImageToRegistry', formatArgs(arguments));
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
 * @param version: version object which containes build
 * @param opts:    opts to pass to docker
 * @param cb: Callback
 */
Docker.prototype.createUserContainer = function (version, opts, cb) {
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
  extend(opts, {
    Image: version.build.dockerTag
  });

  this.createContainer(opts, cb);
};

/**
 * start a user container
 * @param container: container object to start
 * @param opts:      opts to pass to docker
 * @param cb: Callback
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
  if (process.env.DNS_IPADDRESS) {
    dns.push(process.env.DNS_IPADDRESS);
  }
  dns.push(process.env.DNS_DEFAULT_IPADDRESS);

  extend(opts, {
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
 * @param container: container object to start
 * @param cb: Callback
 */
Docker.prototype.startContainer = function (container, opts, cb) {
  debug('startContainer', formatArgs(arguments));
  var self = this;
  var containerId = container.dockerContainer || container.Id;
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
 * pulls image and returns stream
 * @param contextVersion - format 'myrepo/myname:tag'
 * @param cb: Callback
 */
Docker.prototype.pullImage = function (version, cb) {
  debug('pullImage', formatArgs(arguments));
  var self = this;
  self.docker.pull(version.build.dockerTag, cb);
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

function formatArgs (args) {
  var isFunction = require('101/is-function');
  return Array.prototype.slice.call(args)
    .map(function (arg) {
      return isFunction(arg) ?
        '[ Function '+(arg.name || 'anonymous')+' ]' :
        (arg && arg._id || arg);
    });
}
