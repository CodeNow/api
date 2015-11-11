var spyOnClassMethod = require('function-proxy').spyOnClassMethod

var originalMethods = {}

originalMethods.get = function (Class, method) {
  return this[Class.name + '.' + method]
}
originalMethods.set = function (Class, method) {
  if (originalMethods.get(Class, method)) {
    throw new Error(['Method already overridden', Class.name, method].join(' '))
  }
  this[Class.name + '.' + method] = {
    Class: Class,
    method: method,
    fn: Class.prototype[method]
  }
}

function proxyMethod (Class, method, fn) {
  originalMethods.set(Class, method)
  spyOnClassMethod(Class, method, fn)
}

function mocksForMethods (Class, mockMap) {
  Object.keys(mockMap).forEach(function (method) {
    proxyMethod(Class, method, function () {
      mockMap[method].apply(this, arguments)
    })
  })
}

function restoreMethod (Class, method) {
  var original = originalMethods.get(Class, method)
  if (!original) {
    return console.error(['warn: Method not overridden', Class.name, method].join(' '))
  }
  Class.prototype[method] = original.fn
}
function restoreAllMethods () {
  Object.keys(originalMethods).forEach(function (key) {
    if (key === 'get' || key === 'set') { return }
    var Class = originalMethods[key].Class
    var method = originalMethods[key].method
    restoreMethod(Class, method)
    delete originalMethods[key]
  })
}

module.exports.mocksForMethods = mocksForMethods
module.exports.restoreAllMethods = restoreAllMethods
