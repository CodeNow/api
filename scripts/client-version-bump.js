'use strict'

var fs = require('fs')
var path = require('path')

clientVersionBump()

function clientVersionBump () {
  var packagePath = path.resolve(__dirname, '..', 'package.json')
  var pkg = JSON.parse(fs.readFileSync(packagePath))

  var runnablePackagePath = path.resolve(__dirname, '..', 'node_modules/runnable/package.json')
  var runnablePkg = JSON.parse(fs.readFileSync(runnablePackagePath))

  pkg.dependencies.runnable = pkg.dependencies.runnable
    ? pkg.dependencies.runnable.replace(/#[^#]*$/, '#v' + runnablePkg.version)
    : 'git+ssh://git@github.com:CodeNow/runnable-api-client#v' + runnablePkg.version

  console.log('updated to ' + pkg.dependencies.runnable)
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, '  '))
}
