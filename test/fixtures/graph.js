var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var join = require('path').join;
var debug = require('debug')('runnable-api:test:fixtures:graph');

module.exports._graph;
module.exports.started = false;
module.exports.start = function (cb) {
  var graphExec;
  var graphArgs = [];
  var opts = {};
  if (process.env.GRAPH_DATABASE_TYPE === 'cayley') {
    /* This is a tiny bit hacky, but since we have to compile cayley
     * for the mongo fix, I only want to include this binary for local (os x)
     * development. We also now have a binary for circle, so we can control the
     * state of cayley better (up/down). Once the mongo fix is in cayley, we can
     * use cayley properly in both places */
    graphExec = './cayley_osx';
    if (process.env.CIRCLECI) {
      graphExec = './cayley_linux';
    }
    opts.cwd = join(__dirname, 'graphs', 'cayley');
    graphArgs.push('http');
    graphArgs.push('--config=cayley.cfg');
    opts.detached = true;

    module.exports.stop = function (cb) {
      if (module.exports.started) {
        module.exports._graph.on('exit', function () { cb(); });
        module.exports._graph.kill();
      } else {
        cb();
      }
    };

    module.exports._graph = spawn(graphExec, graphArgs, opts);
    module.exports._graph.stdout.on('data', function () {
      if (!module.exports.started) {
        module.exports.started = true;
        cb();
      }
    });

  } else if (process.env.GRAPH_DATABASE_TYPE === 'neo4j') {
    graphExec = './bin/neo4j';
    opts.cwd = join(__dirname, 'graphs', 'neo4j');
    opts.detached = true;

    module.exports.stop = function (cb) {
      if (module.exports.started) {
        exec(graphExec + ' stop', opts, function (err, stdout, stderr) {
          if (err) { debug('err: ' + err.toString()); return cb(err); }
          debug('stop stdout: ' + stdout.toString());
          debug('stop stderr: ' + stderr.toString());
          module.exports.started = false;
          cb();
        });
      } else {
        cb();
      }
    };

    exec(graphExec + ' start', opts, function (err, stdout, stderr) {
      if (err) { debug('err: ' + err.toString()); return cb(err); }
      debug('stdout: ' + stdout.toString());
      debug('stderr: ' + stderr.toString());
      if (!module.exports.started) {
        module.exports.started = true;
        // this needs a split second so that it doesn't try to call neo4j before it's ready
        setTimeout(cb, 150);
      }
    });
  }
};
