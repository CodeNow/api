var customError = require('custom-error')

module.exports = {
  UserNotFoundError: customError('UserNotFoundError'),
  UserNotAllowedError: customError('UserNotAllowedError'),
  OrganizationNotFoundError: customError('OrganizationNotFoundError'),
  OrganizationNotAllowedError: customError('OrganizationNotAllowedError')
}

