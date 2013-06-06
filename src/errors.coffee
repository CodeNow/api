configs = require './configs'

errors = { }
module.exports = errors

errors.ValidationError = () ->

  if arguments.length is 2
    message = arguments[0]
    errors = arguments[1]

  if arguments.length is 3
    message = arguments[0]
    key = arguments[1]
    value = arguments[2]
    errors = { }
    errors[key] = value

  err = { }
  err.message = message
  err.type = 'ValidationError'
  errProto = Object.getPrototypeOf err
  if errors then err.errors = errors
  err