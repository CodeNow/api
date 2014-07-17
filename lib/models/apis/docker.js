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
module.exports = Docker;

function Docker (dockerHost) {
  if (dockerHost) {
    return this.loadDocker(dockerHost);
  }
}

Docker.prototype.loadDocker = function (dockerHost) {
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
};

Docker.prototype.buildVersion = function (version, cb) {
  if (version.build.completed) {
    cb(Boom.conflict('Version already built', version));
  }
  else if (!version.infraCodeVersion) {
    cb(Boom.badRequest('Cannot build a version without a Dockerfile', version));
  }
  else {
    var self = this;
    version.populate('infraCodeVersion', function (err) {
      if (err) { return cb(err); }

      var infraCodeVersion = version.infraCodeVersion;
      var bucket = infraCodeVersion.bucket();
      var indexedVersions = {};
      infraCodeVersion.files.forEach(function (file) {
        indexedVersions[file.Key] = file.VersionId;
      });

      var env = [
        'RUNNABLE_AWS_ACCESS_KEY=' + process.env.S3_AUTH_ACCESS_KEY,
        'RUNNABLE_AWS_SECRET_KEY=' + process.env.S3_AUTH_SECRET_KEY,
        'RUNNABLE_FILES_BUCKET=' + bucket.bucket,
        'RUNNABLE_PREFIX=' + join(bucket.sourcePath, '/'),
        'RUNNABLE_FILES=' + JSON.stringify(indexedVersions),
        'RUNNABLE_DOCKER=unix:///var/run/docker.sock',
        'RUNNABLE_DOCKERTAG=' + (version.name ? version.name : version._id)
      ];
      var binds = [
        '/var/run/docker.sock:/var/run/docker.sock'
      ];
      // no RUNNABLE_REPO
      var dockerErrInfo = {
        dockerHost: self.dockerHost,
        port: self.port,
        cmd: 'run',
        env: env,
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
            return cb(Boom.badGateway('docker attach failed', { err: err, docker: dockerErrInfo }));
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
                  buildStream.clearBuildLog(version._id);
                  if (err) {
                    cb(err);
                  }
                  var result = /Successfully built ([a-f0-9]+)/.exec(buildLogData);
                  if (!(result && result[0])) {
                    cb(Boom.badGateway('docker run failed to build', {
                      res: {
                        statusCode: waitData.StatusCode,
                        body: {
                          data: waitData,
                          container: container
                        }
                      },
                      docker: dockerErrInfo,
                      versionId: version._id,
                      logs: buildLogData
                    }));
                  } else {
                    imageId = result[0];
                    cb(null, {
                      dockerImage: imageId,
                      dockerTag: (version.name ? version.name : version._id).toString(),
                      logs: buildLogData
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

Docker.prototype.createContainer = function (imageId, dockerHost, cb) {
  var opts = {
    Image: imageId
  };
  if (!this.docker) {
    this.loadDocker(dockerHost);
  }
  this.docker.createContainer(opts,
    wrapIfErr(cb, 502, 'Error creating container', { debug: { imageId: imageId } }));
};

Docker.prototype.createAndInspectContainer = function (imageId, dockerHost, cb) {
  this.createContainer(imageId, dockerHost, function (err, container) {
    if (err) { return cb(err); }

    var containerId = container.Id||container.id; // who knows, stupid docker.
    container.inspect(wrapIfErr(cb, 502, 'Error inspecting container', {
      debug: { containerId: containerId }
    }));
  });
};

Docker.prototype.createContainerForVersion = function (version, cb) {
  console.log(version);
  if (!version.build || !version.build.dockerImage) {
    cb(Boom.badRequest('Cannot create a container for an unbuilt version', {
      debug: { versionId: version._id.toString() }
    }));
  } else if (!version.dockerHost) {
    cb(Boom.badRequest('Cannot create a container with no dockerHost', {
      debug: { versionId: version._id.toString() }
    }));
  }
  else {
    this.createAndInspectContainer(version.build.dockerImage, version.dockerHost, cb);
  }
};

// TODO, remove this from here. Docker needs host from version to be created
Docker.prototype.createContainersForVersions = function (versions, cb) {
  async.map(versions,
    this.createContainerForVersion.bind(this),
    cb);
};
