var async, configs, encodeId, images, mongoose, plus, slash
async = require('async')
images = require('../lib/models/images')
configs = require('../lib/loadenv')
mongoose = require('mongoose')
var request = require('request')
mongoose.connect(configs.mongo)
plus = /\+/g
slash = /\//g
encodeId = function (id) {
  return new Buffer(id.toString(), 'hex')
    .toString('base64')
    .replace(plus, '-')
    .replace(slash, '_')
}
images.find({}, function (err, images) {
  if (err) { throw err }
  async.forEachSeries(images, function (image, cb) {
    console.log(image._id)
    request.post({
      url: 'http://10.0.2.235:4243/v1.4/images/registry.runnable.com/runnable/' +
        encodeId(image._id) +
        '/push'
    }, function (err1, resp1, body1) {
      console.log('Trying to push all images for project http://runnable.com/' +
        encodeId(image._id))
      if (err1) {
        console.log('Error is:', err1)
      }
      console.log('body1 is', body1)
      async.eachSeries(image.revisions, function (item, callback) {
        request.post({
          url: 'http://10.0.2.235:4243/v1.4/images/registry.runnable.com/runnable/' +
            encodeId(item.id) +
            '/push'
        }, function (err2, resp2, body2) {
          console.log('http://10.0.2.235:4243/v1.4/images/registry.runnable.com/runnable/' +
            encodeId(item.id) +
            '/push returned')
          if (err2) {
            console.log('err1 is', err2)
          }
          console.log('body2 is', body2)
          return callback(err2)
        })
      }, function (err) {
        cb(err) // final call back
      })
    })
  })
})
