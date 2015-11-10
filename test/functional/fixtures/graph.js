var spawn = require('child_process').spawn
var exec = require('child_process').exec
var join = require('path').join

var logger = require('middlewares/logger')(__filename)
var log = logger.log

module.exports._graph
module.exports.started = false
module.exports.start = function (cb) {
  var graphExec
  var graphArgs = []
  var opts = {}
  if (process.env.GRAPH_DATABASE_TYPE === 'cayley') {
    /* This is a tiny bit hacky, but since we have to compile cayley
     * for the mongo fix, I only want to include this binary for local (os x)
     * development. We also now have a binary for circle, so we can control the
     * state of cayley better (up/down). Once the mongo fix is in cayley, we can
     * use cayley properly in both places */
    graphExec = './cayley_osx'
    if (process.env.CIRCLECI) {
      graphExec = './cayley_linux'
    }
    opts.cwd = join(__dirname, 'graphs', 'cayley')
    graphArgs.push('http')
    graphArgs.push('--config=cayley.cfg')
    opts.detached = true

    var earlyClose = function (code) {
      throw new Error('cayley closed early w/ code ' + code)
    }

    module.exports.stop = function (cb) {
      if (module.exports.started) {
        module.exports._graph.removeListener('close', earlyClose)
        module.exports._graph.on('close', function () {
          module.exports.started = false
          log.trace({}, 'cayley exit')
          cb()
        })
        log.trace({}, 'stopping cayley')
        module.exports._graph.kill()
      } else {
        cb()
      }
    }

    module.exports._graph = spawn(graphExec, graphArgs, opts)
    module.exports._graph.stdout.on('data', function (d) {
      if (!module.exports.started) {
        log.trace({
          data: d
        }, 'cayley start')
        module.exports.started = true
        cb()
      }
    })
    module.exports._graph.stderr.on('data', function (d) {
      console.error(d.toString())
    })
    module.exports._graph.on('error', function (err) {
      throw err
    })
    module.exports._graph.on('close', earlyClose)
  } else if (process.env.GRAPH_DATABASE_TYPE === 'neo4j') {
    graphExec = './bin/neo4j'
    opts.cwd = join(__dirname, 'graphs', 'neo4j')

    module.exports.stop = function (cb) {
      if (module.exports.started) {
        exec(graphExec + ' stop', opts, function (err, stdout, stderr) {
          if (err) {
            log.error({
              err: err
            }, 'exec error')
            return cb(err)
          }
          log.trace({
            stdout: stdout.toString(),
            stderr: stderr.toString()
          }, 'stop')
          module.exports.started = false
          cb()
        })
      } else {
        cb()
      }
    }

    exec(graphExec + ' start', opts, function (err, stdout, stderr) {
      if (err) {
        log.trace({
          err: err
        }, 'exec error')
        return cb(err)
      }
      log.trace({
        stdout: stdout.toString(),
        stderr: stderr.toString()
      }, 'stop')
      if (!module.exports.started) {
        module.exports.started = true
        // this needs a split second so that it doesn't try to call neo4j before it's ready
        setTimeout(cb, 150)
      }
    })
  }
}
