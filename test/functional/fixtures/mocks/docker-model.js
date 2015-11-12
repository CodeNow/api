var nock = require('nock')

var mocker = require('./mocker.js')
var check = {}

module.exports.setup = function (cb) {
  mocker.mocksForMethods(require('../../../../lib/models/apis/docker.js'), {
    startImageBuilderAndWait: function () {
      nock('http://localhost:4243', { allowUnmocked: true })
        .filteringPath(function (path) {
          if (/\/images\/.+\/push/.test(path)) {
            path = '/images/repo/push'
          }
          return path
        })
        .post('/images/repo/push')
        .reply(200, function (uri, requestBody) {
          check.startImageBuilderAndWait = {
            imageId: uri.substring('/images/'.length, uri.lastIndexOf('/push')),
            tag: requestBody.tag
          }
          return requestBody
        })
    }
  })

  cb()
}

// return check object for resting
module.exports.check = function () {
  return check
}

module.exports.clean = function (cb) {
  mocker.restoreAllMethods()
  check = {}
  cb()
}
