var customError = require('custom-error')
const CriticalError = require('error-cat/errors/critical-error')

module.exports = {
  instance: {
    UnbuiltContextVersionError: customError('UnbuiltContextVersionError', CriticalError),
    InstanceCreateFailedError: customError('InstanceCreateFailedError', CriticalError)
  },
  UserNotFoundError: customError('UserNotFoundError'),
  UserNotAllowedError: customError('UserNotAllowedError'),
  OrganizationNotFoundError: customError('OrganizationNotFoundError'),
  OrganizationNotAllowedError: customError('OrganizationNotAllowedError')
}

