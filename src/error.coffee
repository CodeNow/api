util = require 'util'
_ = require 'lodash'

RunnableError = (data) ->
  proto = this.__proto__ = Error.call(this, data.msg)
  proto.name = 'RunnableError'
  proto.stack = proto.stack.replace(/\n[^\n]*/,'') # remove two levels from stack
  proto.stack = proto.stack.replace(/\n[^\n]*/,'')
  _.extend(this, data)

util.inherits RunnableError, Error

module.exports = RunnableError