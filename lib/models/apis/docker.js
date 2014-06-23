'use strict';

var async = require('async');
var debug = require('debug')('runnable-api:docker:model');
var configs = require('configs');
var Dockerode = require('dockerode');
var containerOpts = configs.container;
var error = require('error');
var wrapIfErr = error.wrapIfErr;
var url = require('url');
var dogerode = require('dogerode');
var Boom = require('dat-middleware').Boom;
var join = require('path').join;

module.exports = Docker;

function Docker (host) {
  var parsed = ~host.indexOf('http:') ?
    url.parse(host) :
    url.parse('http://'+host);
  this.host = parsed.protocol +'//'+ parsed.host;
  this.port = parsed.port || 4243;
  this.docker = dogerode(new Dockerode({
    host: this.host,
    port: this.port
  }), {
    service: 'api'
  });
}

Docker.prototype.buildVersion = function (version, cb) {
  var self = this;
  if (version.build.dockerImage) {
    cb(Boom.conflict('Version already built', version));
  }
  else if (!version.dockerfile) {
    cb(Boom.badRequest('Cannot build a version without a Dockerfile', version));
  }
  else {
    var bucket = version.buildFilesBucket();
    var indexedVersions = {};
    if (version.files) {
      version.files.forEach(function (file) {
        indexedVersions[file.Key] = file.VersionId;
      });
    }

    var env = [
      'RUNNABLE_AWS_ACCESS_KEY=' + configs.S3.auth.accessKey,
      'RUNNABLE_AWS_SECRET_KEY=' + configs.S3.auth.secretKey,
      'RUNNABLE_FILES_BUCKET=' + bucket.bucket,
      'RUNNABLE_PREFIX=' + join(bucket.sourcePath, '/'),
      'RUNNABLE_FILES=' + JSON.stringify(indexedVersions),
      'RUNNABLE_DOCKER=' + this.host.replace(/https?/, 'tcp') + ':' + this.port,
      'RUNNABLE_DOCKERTAG=' + (version.name ? version.name : version._id)
    ];
    // no RUNNABLE_REPO
    var buildLogData;
    var builder = this.docker.run(
      'runnable/image-builder',
      null,
      null,
      { Env: env },
      function (err, data, container) {
        debug('callback', err, data, container);
        var dockerErrInfo = {
          host: self.host,
          port: self.port,
          cmd: 'run',
          env: env,
        };
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
  }

  function streamHandler (stream) {
    stream.on('data', function (data) {
      buildLogData += data.toString();
      debug('stream data', data.toString());
    });
    stream.on('end', function () { debug('stream end'); });
  }
};

Docker.prototype.createContainer = function (imageId, cb) {
  var opts = {
    Image: imageId
  };
  this.docker.createContainer(opts,
    wrapIfErr(cb, 502, 'Error creating container', { debug: { imageId: imageId } }));
};

Docker.prototype.createAndInspectContainer = function (imageId, cb) {
  this.createContainer(imageId, function (err, container) {
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
  }
  else {
    this.createAndInspectContainer(version.build.dockerImage, cb);
  }
};

Docker.prototype.createContainersForVersions = function (versions, cb) {
  async.map(versions,
    this.createContainerForVersion.bind(this),
    cb);
};








///// OLD Below:::
// Docker.prototype.createContainer = function (image, container, cb) {
//   var Volumes = {};
//   Volumes[containerOpts.bindFolder] = {};
//   var opts = {
//     Volumes  : Volumes,
//     Cmd      : containerOpts.cmd,
//     Env      : container.getEnv(),
//     PortSpecs: containerOpts.portSpecs,
//     Tty      : true,
//     Hostname : 'runnable',
//     Image    : image.getRepo()
//   };
//   this.docker.createContainer(opts, cb);
// };

Docker.prototype.startContainer = function (containerId, cb) {
  containerId = containerId.slice(0, 12);
  var opts = {
    Binds: containerOpts.binds,
    PortBindings: containerOpts.portBindings
  };
  this.docker.getContainer(containerId)
    .start(opts, cb);
};

Docker.prototype.stopContainer = function (containerId, cb) {
  containerId = containerId.slice(0, 12);
  var opts = {
    t: 1 // stop delay in seconds
  };
  this.docker.getContainer(containerId)
    .stop(opts, cb);
};

Docker.prototype.inspectContainer = function (containerId, cb) {
  containerId = containerId.slice(0, 12);
  this.docker.getContainer(containerId).inspect(cb);
};

Docker.prototype.commitContainer = function (container, cb) {
  var opts = {
    repo: configs.dockerRegistry+'/runnable/'+container._id // must be decoded - hex!!
  };
  var containerId = container.containerId.slice(0, 12);
  this.docker.getContainer(containerId)
    .commit(opts, cb);
};

Docker.prototype.pushRepoById = function (repoId, cb) {
  var repo = configs.dockerRegistry+'/runnable/'+repoId;
  var errored = false;
  this.docker.getImage(repo)
    .push({}, function (err, stream) {
      if (err) {
        cb(err);
      }
      else {
        stream.on('error', onError);
        stream.on('data', onData);
        stream.on('end', onEnd);
      }
      function onError (err) {
        errored = err;
        cb(err);
      }
      function onData (data) {
        if (errored) { return; }
        try {
          JSON.parse(data);
          if (data.error) {
            var errorDetail = data.errorDetail;
            onError(error(502, errorDetail.code+': '+errorDetail.message+' '+data.error));
          }
        }
        catch (err) {
          onError(err);
        }
      }
      function onEnd () {
        if (errored) { return; }
        cb();
      }
    });
};
