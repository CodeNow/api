/**
 * @module lib/express-app
 */
'use strict'

const bodyParser = require('body-parser')
const compression = require('compression')
const envIs = require('101/env-is')
const express = require('express')
const morganFreeman = require('morgan')

const csrf = require('middlewares/csrf')
const dogstatsd = require('monitor-dog')
const error = require('error')
const passport = require('middlewares/passport')
const pkg = require('../package.json')

const app = module.exports = express()

app.use(require('middlewares/security'))

if (envIs('production')) {
  app.use(require('connect-datadog')({
    'dogstatsd': dogstatsd,
    'response_code': true,
    'method': true,
    'tags': [ 'name:api', 'logType:express', 'env:' + process.env.NODE_ENV ]
  }))
}
if (!envIs('test')) {
  app.use(morganFreeman('common'))
}
app.use('/health', function (req, res) { res.send(200) })
app.use(require('routes/github'))
app.use(require('middlewares/cors'))
app.use(require('middlewares/domains'))
if (envIs('test')) { // routes for testing only
  app.use(require('routes/test/errors'))
}
app.use(require('middlewares/no-cache'))
app.use(compression())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json({ limit: process.env.BODY_PARSER_SIZE_LIMIT }))
app.use(require('middlewares/session'))
app.use(passport.initialize({ userProperty: 'sessionUser' }))
app.use(passport.session())

// Add CSRF protection!
app.use(csrf.csrfValidator)
app.use(csrf.csrfCookieInjector)

/**
 * Attach session properties and request body (if present) to domain
 */
app.use(require('middlewares/domains').updateDomain)
app.use(require('routes/auth'))
app.use(require('routes/auth/github'))
app.use(require('routes/actions/redirect'))
app.use(require('routes/github-hooks'))
app.use(require('middlewares/auth').requireAuth)
app.use(require('routes/auth/whitelist'))
app.use(require('routes/users'))
app.use(require('middlewares/auth').requireWhitelist)
app.use(require('routes/actions/analyze/index'))
app.use(require('routes/actions/moderate'))
app.use(require('routes/auto-isolation-configs'))
app.use(require('routes/builds'))
app.use(require('routes/contexts'))
app.use(require('routes/contexts/versions'))
app.use(require('routes/contexts/versions/app-code-versions'))
app.use(require('routes/contexts/versions/files'))
app.use(require('routes/debug-containers'))
app.use(require('routes/debug-containers/files'))
app.use(require('routes/instances'))
app.use(require('routes/instances/containers'))
app.use(require('routes/instances/containers/files'))
app.use(require('routes/instances/dependencies'))
app.use(require('routes/instances/master-pod'))
app.use(require('routes/isolation'))
app.use(require('routes/settings'))
app.use(require('routes/templates'))
app.use(require('routes/users/routes'))
app.use(require('routes/health'))
app.use(require('routes/teammate-invitation'))
app.use(require('routes/billing'))
app.use(require('routes/docker-compose-cluster'))
/* ERRORS */
app.use(error.csrfHandler)
app.use(error.mongooseErrorCaster)
app.use(error.errorCaster)
app.use(error.sendIf400Error)
app.use(error.errorHandler)
app.get('/', function (req, res) {
  res.json({
    message: 'runnable api',
    version: pkg.version,
    branch: process.env._VERSION_GIT_BRANCH,
    codeVersion: process.env._VERSION_GIT_COMMIT
  })
})
app.all('*', function (req, res) {
  res.json(404, { message: 'resource not found' })
})
