var mongoose = require('mongoose')
var keypather = require('keypather')()
var async = require('async')
mongoose.connect('mongodb://localhost/delta')

var UserSchema = require('models/mongo/schemas/user.js')
var User = mongoose.model('Users', UserSchema)

var keypaths = {
  'email': 'string',
  'name': 'string',
  'company': 'string',
  'permissionLevel': 'number',
  'showEmail': 'boolean',
  'created': 'string',
  'gravatar': 'string',
  'accounts': 'object',
  'accounts.github': 'object',
  'accounts.github.id': 'string',
  'accounts.github.accessToken': 'string',
  'accounts.github.refreshToken': 'string',
  'accounts.github.displayName': 'string',
  'accounts.github.username': 'string',
  'accounts.github.avatar_url': 'string',
  'accounts.github.emails': 'array',
  'accounts.github.emails[0]': 'string',
  'accounts.github._json': 'object',
  'accounts.github._json.name': 'string',
  'routes': 'array',
  'userOptions': 'object',
  'userOptions.uiState': 'object',
  'userOptions.uiState.shownCoachMarks': 'string',
  'userOptions.uiState.previousLocation': 'string'
}

Object.keys(keypaths).forEach(function (key) {
  var type = keypaths[key]
  keypaths[key] = {
    name: key,
    type: type,
    count: 0,
    wrongType: 0,
    missing: 0
  }
})

var coll
User.find({}, function (err, _coll) {
  coll = _coll
  if (err) return console.error(err)
  async.map(coll, function (model, cb) {
    var user = new User(model)
    user.validate(function (err) {
      if (err) {
        console.log('Err', err, model)
        return cb(err)
      }
      Object.keys(keypaths).forEach(function (key) {
        var keyPath = keypaths[key]
        var value = keypather.get(model, key)
        if (value !== undefined && value !== null) {
          keyPath.count += 1
          if (typeof value !== keyPath.type) {
            keyPath.wrontType += 1
          }
        } else {
          keyPath.missing += 1
        }
      })
      return cb()
    })
  }, function () {
    var entries = Object.keys(keypaths).map(function (key) {
      return keypaths[key]
    })
    entries = entries.sort(function (a, b) {
      return b.missing - a.missing
    }).filter(function (model) {
      return model.missing > 0
    })
    var entriesMap = entries.map(function (model) {
      return model.name + ' - ' + model.missing + '( missing in ' + (Math.floor(100 * (model.missing / coll.length))) + '% of models ) - Wrong Type: ' + model.wrongType
    })
    console.log(entriesMap)
    console.log('Total Users:', coll.length)
    process.exit()
  })
})
