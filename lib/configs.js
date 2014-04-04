var eson = require('eson');
var os = require('os');
var path = require('path');
var uuid = require('node-uuid');
var env = process.env.NODE_ENV || 'development';
function readConfigs (filename) {
  return eson()
    .use(eson.ms)
    .use(eson.replace('{ROOT_DIR}', path.normalize(__dirname + '/..')))
    .use(eson.replace('{RAND_NUM}', uuid.v4().split('-')[0]))
    .use(eson.replace('{HOME_DIR}', process.env.HOME))
    .use(eson.replace('{CURR_DIR}', __dirname + '/../configs'))
    .use(eson.replace('{RAND_DIR}', os.tmpDir() + '/' + uuid.v4()))
    .read(__dirname + '/../configs/' + filename + '.json');
}
module.exports = readConfigs(env);
module.exports.readConfigs = readConfigs;