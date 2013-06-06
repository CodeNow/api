base64url = require 'base64url'
crypto = require 'crypto'

utils = { }
module.exports = utils

utils.unCamelCase = (str, delimeter, capitalize) ->

  delimeter = delimiter or '-'
  regex = /[A-Z]/g
  newStr = ''
  lastIndex = 0
  str.replace regex, (match, index) ->
    newStr += str.substring lastIndex, index
    lastIndex = index + 1
    if index isnt 0
      match = delimeter + match
    newStr += match.toLowerCase()
  newStr += str.substring lastIndex
  if capitalize then newStr[0].toUpperCase() + newStr.slice(1) else newStr