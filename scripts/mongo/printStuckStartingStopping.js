'use strict'

var console = { log: print }
var $startingOrStopping = {
  $or: [
    {
      'container.inspect.State.Starting': true
    },
    {
      'container.inspect.State.Stopping': true
    }
  ]
}
var timeout = 2 * 60 * 1000 // 2m

console.log('Started ' + new ISODate())
var instanceIds1 = []
var instanceIds2 = []
db.instances
  .find($startingOrStopping)
  .forEach(function (instance) {
    instanceIds1.push(instance._id.toString())
  })

console.log('Waiting %s min and checking if any instances are stuck'.replace('%s', timeout / 60000))
setTimeout(function () {
  db.instances
    .find($startingOrStopping)
    .forEach(function (instance) {
      instanceIds2.push(instance._id.toString())
    })
  var stuckInstances = intersection(instanceIds1, instanceIds2)

  console.log('Completed ' + new ISODate())
  console.log('Stuck instances')
  printjson(stuckInstances)
}, timeout)

/* Utils */
function intersection (arr1, arr2) {
  return arr1.map(function (id) {
    var index = findIndex(arr2, equals(id))
    if (~index) {
      instanceIds2.splice(index, 1)
      return true
    }
  })
}
function equals (id1) {
  return function (id2) {
    return id1 === id2
  }
}
function findIndex (arr, fn) {
  var index = -1
  arr.some(function (item, i) {
    if (fn(item)) {
      index = i
      return true
    }
  })

  return index
}
