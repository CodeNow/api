'use strict'

/**
 * Script to keep JSON files neat / alphabetically organized
 * usage:
 *   node ./organize-analyze-data.js
 */

var fs = require('fs')

;[
  'nodejs',
  'python',
  'ruby',
  'php'
].forEach(function (lang) {
  console.log('lang', lang)
  console.log(__dirname)
  var json = require(__dirname + '/../lib/routes/actions/analyze/data/suggestable-services-' + lang)
  var fjson = {}
  Object.keys(json).sort().forEach(function (key) {
    var lowerCaseKey = key.toLowerCase()
    fjson[lowerCaseKey] = json[key]
    fjson[lowerCaseKey] = fjson[lowerCaseKey].sort()
    fjson[lowerCaseKey] = fjson[lowerCaseKey].map(function (val) {
      return val.replace(' ', '')
    })
  //
  })
  fs.writeFileSync(__dirname + '/../lib/routes/actions/analyze/data/suggestable-services-' + lang + '.json',
    JSON.stringify(fjson, null, ' '))
})
