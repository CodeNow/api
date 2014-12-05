var spawn = require('child_process').spawn;
var join = require('path').join;

var cayleyPath = join(__dirname, 'cayley');

module.exports._cayley;
module.exports.started = false;
module.exports.start = function (cb) {
  /* This is a tiny bit hacky, but since we have to compile cayley
   * for the mongo fix, I only want to include this binary for local (os x)
   * development. We also now have a binary for circle, so we can control the
   * state of cayley better (up/down). Once the mongo fix is in cayley, we can
   * use cayley properly in both places */
  var cayleyExec = './cayley_osx';
  if (process.env.CIRCLECI) {
    cayleyExec = './cayley_linux';
  }
  module.exports.started = true;
  module.exports._cayley = spawn(cayleyExec,
    [
      'http',
      '--config=cayley.cfg'
    ],
    {
      cwd: cayleyPath,
      detached: true
    }
  );
  module.exports._cayley.stderr.on('data', function (d) { console.error(d.toString()); });
  module.exports._cayley.on('error', function (err) {
    console.error(err);
  });
  module.exports._cayley.on('exit', function () {
    module.exports.started = false;
  });
  cb();
};
module.exports.stop = function (cb) {
  if (module.exports.started) {
    module.exports._cayley.on('exit', function () { cb(); });
    module.exports._cayley.kill();
  } else {
    cb();
  }
};
