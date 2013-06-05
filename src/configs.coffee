eson = require 'eson'
os = require 'os'
uuid = require 'node-uuid'
env = process.env.NODE_ENV or 'development'

readConfigs = (filename) ->
  eson()
  .use(eson.args())
  .use(eson.env())
  .use(eson.ms)
  .use(eson.replace('{RAND_NUM}', uuid.v4().split('-')[0]))
  .use(eson.replace('{HOME_DIR}', process.env.HOME))
  .use(eson.replace('{CURR_DIR}', __dirname + '/../configs'))
  .use(eson.replace('{RAND_DIR}', os.tmpDir() + '/' + uuid.v4()))
  .read(__dirname + '/../configs/' + filename + '.json')

configs = module.exports = readConfigs env
module.exports.readConfigs = readConfigs