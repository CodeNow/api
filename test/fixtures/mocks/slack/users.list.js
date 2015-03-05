'use strict';
var nock = require('nock');


module.exports = function () {
  nock('https://api.slack.com:443')
    .filteringRequestBody(function() {
      return '*';
    })
    .post('/api/users.list', '*')
    .reply(200, {
      'ok': true,
      'members': [
          {
              'id': 'U023BECGF',
              'name': 'bobby',
              'deleted': false,
              'color': '9f69e7',
              'profile': {
                  'first_name': 'Bobby',
                  'last_name': 'Tables',
                  'real_name': 'Bobby Tables',
                  'email': 'bobby@runnable.com',
                  'skype': 'my-skype-name',
                  'phone': '+1 (123) 456 7890',
                  'image_24': 'https:\/\/...',
                  'image_32': 'https:\/\/...',
                  'image_48': 'https:\/\/...',
                  'image_72': 'https:\/\/...',
                  'image_192': 'https:\/\/...'
              },
              'is_admin': true,
              'is_owner': true,
              'has_files': true
          },
          {
              'id': 'U023BECGX',
              'name': 'anton',
              'deleted': false,
              'color': '9f69e7',
              'profile': {
                  'first_name': 'Anton',
                  'last_name': 'Podviaznikov',
                  'real_name': 'Anton Podviaznikov',
                  'email': 'anton@runnable.com',
                  'skype': 'my-skype-name',
                  'image_24': 'https:\/\/...',
                  'image_32': 'https:\/\/...',
                  'image_48': 'https:\/\/...',
                  'image_72': 'https:\/\/...',
                  'image_192': 'https:\/\/...'
              },
              'is_admin': true,
              'is_owner': true,
              'has_files': true
          }
      ]
  }, {});
};
