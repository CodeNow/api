var ip = require('ip')

module.exports = 'http://' + ip.address() + ':4243'
