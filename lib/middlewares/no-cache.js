'use strict'

module.exports = function (req, res, next) {
  res.setHeader('Cache-Control', 'no-cache')
  next()
}
