util = require 'util'

RunnableError = (data) ->
  @msg = data.msg
  @code = data.code

util.inherits RunnableError, Error
RunnableError.prototype.name = 'Runnable Error'

module.exports = RunnableError