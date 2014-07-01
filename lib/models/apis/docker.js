'use strict';

var async = require('async');
var debug = require('debug')('runnable-api:docker:model');
var configs = require('configs');
var Dockerode = require('dockerode');
var error = require('error');
var wrapIfErr = error.wrapIfErr;
var url = require('url');
var dogerode = require('dogerode');
var Boom = require('dat-middleware').Boom;
var join = require('path').join;

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
  var self = this;
  if (version.build.dockerImage) {
    cb(Boom.conflict('Version already built', version));
  }
  else if (!version.infraCodeVersion) {
    cb(Boom.badRequest('Cannot build a version without a Dockerfile', version));
  }
  else {
    var buildLogData;
    version.populate('infraCodeVersion', function (err) {
      if (err) { cb(err); }

      var infraCodeVersion = version.infraCodeVersion;
      var bucket = infraCodeVersion.bucket();
      var indexedVersions = {};
      infraCodeVersion.files.forEach(function (file) {
        indexedVersions[file.Key] = file.VersionId;
      });
      var env = [
        'RUNNABLE_AWS_ACCESS_KEY=' + configs.S3.auth.accessKey,
        'RUNNABLE_AWS_SECRET_KEY=' + configs.S3.auth.secretKey,
        'RUNNABLE_FILES_BUCKET=' + bucket.bucket,
        'RUNNABLE_PREFIX=' + join(bucket.sourcePath, '/'),
        'RUNNABLE_FILES=' + JSON.stringify(indexedVersions),
        'RUNNABLE_DOCKER=' + self.dockerHost.replace(/https?/, 'tcp') + ':' + self.port,
        'RUNNABLE_DOCKERTAG=' + (version.name ? version.name : version._id)
      ];
      // no RUNNABLE_REPO
      var builder = self.docker.run(
        'runnable/image-builder',
        null,
        null,
        { Env: env },
        function (err, data, container) {
          debug('callback', err, data, container);
          var dockerErrInfo = {
            host: self.dockerHost,
            port: self.port,
            cmd: 'run',
            env: env,
          };
          debug('dockerInfo', dockerErrInfo);
          if (err) {
            cb(Boom.badGateway('docker run failed', {
              err: err,
              docker: dockerErrInfo
            }));
          }
          else if (data.StatusCode !== 0) {
            cb(Boom.badImplementation('docker run failed (' + data.StatusCode + ')'), {
              res: {
                statusCode: data.StatusCode,
                body: {
                  data: data,
                  container: container
                }
              },
              docker: dockerErrInfo
            });
          }
          else {
            var imageId;
            var result = /Successfully built ([a-f0-9]+)/.exec(buildLogData);
            if (!(result && result[0])) {
              cb(Boom.badGateway('docker run failed to build', {
                res: {
                  statusCode: data.StatusCode,
                  body: {
                    data: data,
                    container: container
                  }
                },
                docker: dockerErrInfo,
                versionId: version._id
              }));
            } else {
              imageId = result[0];
              cb(null, {
                dockerImage: imageId,
                dockerTag: (version.name ? version.name : version._id).toString()
              });
            }
          }
        });

      builder.on('container', function (data) { debug('container', data); });
      builder.on('stream', streamHandler);
      builder.on('data', function (data) { debug('data', data); });
    });
  }

  function streamHandler (stream) {
    stream.on('data', function (data) {
      buildLogData += data.toString();
      debug('stream data', data.toString());
    });
    stream.on('end', function () { debug('stream end'); });
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