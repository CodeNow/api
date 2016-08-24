var customError = require('custom-error')

module.exports = {
  UserNotFoundError: customError('UserNotFoundError'),
  OrganizationNotFoundError: customError('OrganizationNotFoundError'),
  OrganizationNotAllowedError: customError('OrganizationNotAllowedError')
}

