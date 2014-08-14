'use strict';

var async = require('async');
var debug = require('debug')('runnable-api:docker:model');
var Dockerode = require('dockerode');
var error = require('error');
var wrapIfErr = error.wrapIfErr;
var url = require('url');
var dogerode = require('dogerode');
var Boom = require('dat-middleware').Boom;
var join = require('path').join;
var buildStream = require('socket/build-stream.js');
var Mavis = require('models/apis/mavis');

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
    service: 'api'
  });
}

/**
 * build a version creating an image.
 * @param containerId Id of the container to grab logs from
 * @param cb Callback to send the log stream back to
 */
Docker.prototype.buildVersion = function (version, sessionUser, cb) {
  if (version.build.completed) {
    cb(Boom.conflict('Version already built', version));
  }
  else if (!version.infraCodeVersion) {
    cb(Boom.badRequest('Cannot build a version without a Dockerfile', version));
  }
  else {
    var self = this;
    /*jshint maxcomplexity:6*/
    version.populate('infraCodeVersion', function (err) {
      if (err) { return cb(err); }

      var infraCodeVersion = version.infraCodeVersion;
      var bucket = infraCodeVersion.bucket();
      var indexedVersions = {};
      infraCodeVersion.files.forEach(function (file) {
        indexedVersions[file.Key] = file.VersionId;
      });
      // Build the repo url
      // FIXME: Way in the future, we'll have to figure out what to do if the component has
      // multiple repos

      if (!sessionUser) {
        cb(Boom.badRequest('Cannot build a version without the current sessionUser', version));
      }

      var runnableDockerTag = join(
        'registry.runnable.com/',
        '' + sessionUser.accounts.github.id,
        '' + version.context + ':' + version._id);
      var env = [
        'RUNNABLE_AWS_ACCESS_KEY=' + process.env.S3_AUTH_ACCESS_KEY,
        'RUNNABLE_AWS_SECRET_KEY=' + process.env.S3_AUTH_SECRET_KEY,
        'RUNNABLE_FILES_BUCKET=' + bucket.bucket,
        'RUNNABLE_PREFIX=' + join(bucket.sourcePath, '/'),
        'RUNNABLE_FILES=' + JSON.stringify(indexedVersions),
        'RUNNABLE_DOCKER=unix:///var/run/docker.sock',
        'RUNNABLE_DOCKERTAG=' + runnableDockerTag
      ];
      if (version.appCodeVersions && version.appCodeVersions.length > 0) {
        var repoUrl = 'git@github.com:' + version.appCodeVersions[0].repo;
        env.push('RUNNABLE_REPO=' + repoUrl);
        if (version.appCodeVersions[0].privateKey) {
          env.push('RUNNABLE_KEYS_BUCKET=' + process.env.GITHUB_DEPLOY_KEYS_BUCKET);
          env.push('RUNNABLE_DEPLOYKEY=' + version.appCodeVersions[0].privateKey);
        }
      }
      var binds = [
        '/var/run/docker.sock:/var/run/docker.sock'
      ];
      // FIXME: TODO: add prev dock here
      // no RUNNABLE_REPO
      var dockerErrInfo = {
        dockerHost: self.dockerHost,
        port: self.port,
        cmd: 'run',
        env: env
      };

      debug('dockerErrInfo', dockerErrInfo);

      self.docker.createContainer({
        Image: 'runnable/image-builder',
        Env: env
      }, function (err, container) {
        if (err || !container) {
          return cb(Boom.badGateway('docker create failed', { err: err, docker: dockerErrInfo }));
        }
        debug('create container', container);
        container.attach({stream: true, stdout: true, stderr: true}, function (err, stream) {
          if (err || !stream) {
            return cb(Boom.badGateway('docker attach failed', { err: err,
                docker: dockerErrInfo
              }));
          }
          debug('attach container');

          buildStream.sendBuildStream(version._id, stream);

          container.start({ Binds: binds }, function (err, data) {
            debug('start data', err, data);
            if (err) {
              return cb(Boom.badGateway('docker start failed', {
                err: err,
                docker: dockerErrInfo
              }));
            }
            container.wait(function (err, waitData) {
              debug('wait data', err, waitData);
              if (err) {
                return cb(Boom.badGateway('docker wait failed', {
                  err: err,
                  docker: dockerErrInfo
                }));
              }
              var imageId;
              buildStream.getBuildLog(version._id, function(err, buildLogData) {
                  if (err) {
                    return cb(err);
                  }
                  var result = /Successfully built ([a-f0-9]+)/.exec(buildLogData);
                  if (!(result && result[1])) {
                    dockerErrInfo.log = buildLogData;
                    cb(Boom.badGateway('docker run failed to build', {
                      res: {
                        statusCode: waitData.StatusCode,
                        body: {
                          data: waitData,
                          container: container
                        }
                      },
                      docker: dockerErrInfo,
                      versionId: version._id
                    }));
                  } else {
                    imageId = result[1];
                    cb(null, {
                      dockerImage: imageId,
                      dockerTag: runnableDockerTag,
                      buildLog: buildLogData,
                      dockerHost: self.dockerHost
                    });
                  }
                });
            });
          });
        });
      });
    });
  }
};

/**
 * This function fetches a container, queries Docker for it's logs, and sends them to the supplied
 * callback
 * @param containerId Id of the container to grab logs from
 * @param cb Callback to send the log stream back to
 */
Docker.prototype.getLogs = function(containerId, cb) {
  var container = this.docker.getContainer(containerId);
  if (!container) {
    cb(new Error('The requested container has not been created'));
  } else {
    // With the container, we can request the logs
    // TODO: add max length of log lines to tail
    container.logs({follow: true, stdout: true, stderr: true, timestamps: true}, cb);
  }
};

Docker.prototype.createContainer = function (imageId, cb) {
  var self = this;
  var opts = {
    Image: imageId
  };
  self.docker.createContainer(
    opts,
    wrapIfErr(cb, 502, 'Error creating container', {
      debug: { imageId: imageId }
    })
  );
};

function addDockerHostToInspect(dockerHost, cb) {
  return function(err, inspect) {
    inspect.dockerHost = dockerHost;
    cb(err, inspect);
  };
}

Docker.prototype.createAndInspectContainer = function (version, cb) {
  this.createContainer(version.build.dockerImage, function (err, container) {
    if (err) { return cb(err); }
    container.dockerHost = version.dockerHost;
    container.start({ PublishAllPorts: true }, function (err) {
      if (err) { return cb(err); }

      var containerId = container.Id||container.id; // who knows, stupid docker.
      container.inspect(
        wrapIfErr(
          addDockerHostToInspect(container.dockerHost, cb),
          502,
          'Error inspecting container', { debug: { containerId: containerId }}
        )
      );
    });
  });
};

Docker.prototype.createContainerForVersion = function (version, cb) {
  if (!version.build || !version.build.dockerImage) {
    return cb(Boom.badRequest('Cannot create a container for an unbuilt version', {
      debug: { versionId: version._id.toString() }
    }));
  }
  this.createAndInspectContainer(version, cb);
};

Docker.createContainersForVersions = function (versions, cb) {
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
          docker.createContainerForVersion(version, cb);
        });
      });
    }, cb);
};

/**
 * docker inspect container
 * @param container: container object to inspect
 * @param cb: Callback
 */
Docker.prototype.inspectContainer = function (container, cb) {
  this.docker
    .getContainer(container.dockerContainer)
    .inspect(cb);
};

/**
 * attempts to remove a non-running container.
 * if the container is running, an error should be thrown
 * @param container: container object to remove
 * @param cb: Callback
 */
Docker.prototype.removeContainer = function (container, cb) {
  if (!container.dockerContainer || !container.dockerHost) {
    return cb(Boom.badRequest('Container does not have docker information'));
  }
  var self = this;
  var containerId = container.dockerContainer;
  self.docker
    .getContainer(containerId)
    .remove({}, function (err) {
      if (err) {
        return cb(Boom.badGateway('Error removing container', {
          err: err,
          debug: {
            dockerHost: container.dockerHost,
            containerId: container.dockerContainer
          }
        }));
      }
      cb();
    });
};

/**
 * removes an array of containers
 * @param containers: array of container objects to remove
 * @param cb: Callback
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
 * attempts to stop a running container.
 * if not stoped in passed in time, the process is kill 9'd
 * @param container: container object to kill
 * @param cb: Callback
 */
Docker.prototype.stopContainer = function (container, cb) {
  if (!container.dockerContainer || !container.dockerHost) {
    return cb(Boom.badRequest('Container does not have docker information'));
  }
  var self = this;
  var containerId = container.dockerContainer;
  self.docker
    .getContainer(containerId)
    .stop({}, function (err) {
      if (err) {
        return cb(Boom.badGateway('Error stopping container', {
          err: err,
          debug: {
            dockerHost: container.dockerHost,
            containerId: container.dockerContainer
          }
        }));
      }
      cb();
    });
};

/**
 * stop an array of containers
 * @param containers: array of container objects kill
 * @param cb: Callback
 */
Docker.stopContainers = function (containers, cb) {
  if (!Array.isArray(containers)) {
    containers = [containers];
  }
  async.map(
    containers,
    function (container, cb) {
      var docker = new Docker(container.dockerHost);
      docker.stopContainer(container, cb);
    }, cb);
};


/**
 * attempts to start a stoped container
 * @param container: container object to start
 * @param cb: Callback
 */
Docker.prototype.startContainer = function (container, cb) {
  var self = this;
  var containerId = container.dockerContainer;
  self.docker
    .getContainer(containerId)
    .start({}, function (err) {
      if (err) {
        cb(Boom.badGateway('Error starting container', {
          err: err,
          debug: {
            dockerHost: container.dockerHost,
            containerId: container.dockerContainer
          }
        }));
      }
      else {
        cb();
      }
    });
};
