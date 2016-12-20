var customError = require('custom-error')

module.exports = {
  UserNotAllowedError: customError('UserNotAllowedError'),
  OrganizationNotFoundError: customError('OrganizationNotFoundError'),
  OrganizationNotAllowedError: customError('OrganizationNotAllowedError')
}

