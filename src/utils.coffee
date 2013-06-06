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

utils.decodeSignedRequest = (signed_request, secret) ->

  encoded_data = signed_request.split '.', 2
  sig = encoded_data[0]
  json = base64url.decode encoded_data[1]
  data = JSON.parse json

  if not data.algorithm or data.algorithm.toUpperCase() isnt 'HMAC-SHA256'
    console.error 'Unknown algorithm. Expected HMAC-SHA256'
    return null

  expected_sig = crypto.createHmac('sha256',secret).update(encoded_data[1]).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace('=','')
  if sig isnt expected_sig
    console.error 'Bad signed JSON Signature!'
    return null

  data