var customError = require('custom-error')

module.exports = {
  OrganizationNotFoundError: customError('OrganizationNotFoundError'),
  OrganizationNotAllowedError: customError('OrganizationNotAllowedError')
}

