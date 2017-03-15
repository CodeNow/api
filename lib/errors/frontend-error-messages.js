'use strict'

module.exports = {
  instances: {
    create: {
      unbuiltCv: 'A build didn\'t start correctly.  Please try again',
      failed: 'Something went wrong, please reattempt to build the your template'
    }
  },
  user: {
    notFound: {
      github: 'Our connection to Github seems to have had a hiccup.  Please try again',
      default: 'Your user account could not be found in our system'
    }
  },
  contextVersions: {
    create: {
      deployKey: 'Could not get github keys, do you have admin access?'
    }
  }
}
