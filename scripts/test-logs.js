//'use strict'
//console.log('Starting');
//var fs = require('fs')
//var Dockerode = require('dockerode')
//
//var createStreamCleanser = require('docker-stream-cleanser')
//var JSONStream = require('JSONStream')
//
//var docker = new Dockerode({
//  host: 'localhost',
//  port: 2375,
//  ca: fs.readFileSync('/Users/myztiq/runnable/devops-scripts/ansible/roles/docker_client/files/certs/swarm-manager/ca.pem'),
//  cert: fs.readFileSync('/Users/myztiq/runnable/devops-scripts/ansible/roles/docker_client/files/certs/swarm-manager/cert.pem'),
//  key: fs.readFileSync('/Users/myztiq/runnable/devops-scripts/ansible/roles/docker_client/files/certs/swarm-manager/key.pem')
//})
//console.log('Docker', docker);
//var container = docker.getContainer('50667e833e4ded3aeb257fe74242b565a26df770d57a167eed8d7302e070c933')
//console.log('container', container);
//console.time('Stream');
//container.logs({
//  follow: true,
//  stdout: true,
//  stderr: true,
//  tail: 'all'
//
//}, function (err, stream) {
//  if (err) {
//    throw err;
//  }
//  var streamCleanser = createStreamCleanser()
//  var jsonParser = JSONStream.parse()
//
//
//  stream.on('error', function () {
//    console.log('stream Error');
//  })
//  streamCleanser.on('error', function () {
//    console.log('StreamClenser Error');
//  })
//  jsonParser.on('error', function () {
//    console.log('JSON Parse Error');
//  })
//
//
//  console.log('Setup Stream.');
//  stream
//    .pipe(streamCleanser)
//    .pipe(jsonParser)
//    .on('data', function (data) {
//      //console.log(data.content);
//    }) // json parser events
//    .on('end', function () {
//      console.timeEnd('Stream');
//      console.log('END');
//    })
//})

var keypather = require('keypather')()
var fs = require('fs')
var Dockerode = require('dockerode')
var JSONStream = require('JSONStream')
var TCA = require('tailable-capped-array')
var isObject = require('101/is-object')
var log = {
  info: console.log
}

var docker = new Dockerode({
  host: 'localhost',
  port: 2375,
  ca: fs.readFileSync('/Users/myztiq/runnable/devops-scripts/ansible/roles/docker_client/files/certs/swarm-manager/ca.pem'),
  cert: fs.readFileSync('/Users/myztiq/runnable/devops-scripts/ansible/roles/docker_client/files/certs/swarm-manager/cert.pem'),
  key: fs.readFileSync('/Users/myztiq/runnable/devops-scripts/ansible/roles/docker_client/files/certs/swarm-manager/key.pem')
})


var Docker = function () {
  this.docker = docker;
}

Docker.prototype.getLogs = function (containerId, tail, cb) {
  if (typeof tail === 'function') {
    cb = tail
    tail = 'all'
  }
  var logData = {
    tx: true,
    containerId: containerId,
    tail: tail
  }
  log.info(logData, 'Docker.prototype.getLogs')
  var self = this
  var container = this.docker.getContainer(containerId)
  if (!container) {
    log.error(logData, 'getLogs error, container not created')
    return cb(new Error('The requested container has not been created'))
  }
  // With the container, we can request the logs
  // TODO: add max length of log lines to tail
  container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: tail
  }, function (err) {
    if (err) {
      console.log(err);
    } else {
      console.log(logData, 'getLogs: success');
    }


    self.handleErr(cb, 'Get logs  failed',
      { containerId: containerId }).apply(this, arguments)
  })
}

Docker.prototype.handleErr = function (cb, errMessage, errDebug) {
  return function (err) {
    if (err) {
      console.log(cb, errMessage, errDebug);
      console.log('Handling err', err);
    }
    cb.apply(null, arguments)
  }
}


function createJSONParser (client, onErr) {
  onErr = onErr || function () {}
  var jsonParser = JSONStream.parse()
  jsonParser.on('root', onRootEvent)
  jsonParser.on('error', onErrorEvent)
  jsonParser.on('end', onEndEvent)
  jsonParser.on('data', onData)

  // Preserve last 10 data items for inspection if error
  var data = new TCA(10)
  function onData (_data) {
    data.push(_data)
  }
  function onRootEvent (data) {
    if (!isObject(data)) { data = {} }
    client.write(data)
  }
  function onErrorEvent (jsonParseErr) {
    jsonParser.removeListener('root', onRootEvent)
    jsonParser.removeListener('error', onErrorEvent)
    jsonParser.removeListener('end', onEndEvent)
    log.warn({
      tx: true,
      err: jsonParseErr,
      streamData: data.toArray()
    }, 'createJSONParser onErrorEvent')
    onErr('json parse failed to read build logs: ' + jsonParseErr.message)
  }
  function onEndEvent () {
    client.end()
  }

  return jsonParser
}


var pipeBuildLogsToClient = function (version, clientStream) {
  var self = this
  var logData = {
    tx: true,
    version: version._id,
    dockerContainer: keypather.get(version, 'build.dockerContainer')
  }
  log.info(logData, 'BuildStream.prototype._pipeBuildLogsToClient')
  var docker = new Docker()
  // make sure client stream is still writable
  if (!clientStream.stream) { return }
  docker.getLogs(version.build.dockerContainer, function (err, dockerLogStream) {
    if (err) { return writeLogError(err) }

    log.info(logData, '_pipeBuildLogsToClient: begin pipe job')
    var jsonParser = createJSONParser(clientStream, writeLogError)
    // Don't call end, at least for now
    // The substream will end when the user disconnects
    docker.docker.modem.demuxStream(dockerLogStream, jsonParser, jsonParser)
  })
  function writeLogError (err) {
    log.trace({
      tx: true,
      err: err
    }, 'BuildStream.prototype._pipeBuildLogsToClient writeLogErr')
    error.log(err)
    return self._writeErr(err.messsage, version)
  }
}


pipeBuildLogsToClient({
  _id: '1234',
  build: {
    dockerContainer: '50667e833e4ded3aeb257fe74242b565a26df770d57a167eed8d7302e070c933'
  }
}, {
  write: function (data) {
    console.log(data.content);
  },
  stream: {

  }
})
