module.exports = function (obj) {
  return function (done) {
    Object.keys(obj).forEach(function (key) {
      delete obj[key]
    })
    done()
  }
}
