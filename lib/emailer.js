var _ = require('lodash');
var async = require('async');
var configs = require('./configs');
var User = require('models/users');
var nodemailer = require('nodemailer');
var utils = require('middleware/utils');

exports.sendDelistEmail = function(userId, container, cb) {
  async.waterfall([
    User.findById.bind(User, userId),
    sendDelistEmailToUser
  ], cb);
  var self = this;
  function sendDelistEmailToUser (user, cb) {
    var email = delistEmail(user, container);
    self.sendEmailToUser(user, email.subject, email.body, cb);
  }
};

exports.sendEmailToUser = function (user, subject, body, cb) {
  var opts = {
    to: user.email,
    subject: subject,
    text: body
  };
  this.sendEmail(opts, cb);
};

exports.sendEmail = function (opts, cb) {
  if (!configs.SES.sendMail) {
    console.log('Info: Email send log (no config set):', opts.to, opts.subject);
    return cb();
  }
  var transport = nodemailer.createTransport('SMTP', {
    service: 'SES',
    auth: {
      user: configs.SES.auth.username,
      pass: configs.SES.auth.pass
    }
  });
  _.extend(opts, {
    from   : configs.SES.from,
    replyTo: configs.SES.replyTo,
  });
  transport.sendMail(opts, function(err, response) {
    if (err) {
      cb(new Error('Email failed to send (SES): '+ err.message));
    }
    transport.close();
    cb();
  });
};

// Templates
//

function delistEmail (user, container) {
  var subject = '[test] Code Example Delisted from Runnable';
  var body =
    ['Hi ' + user.username + ',\n',
    ['Your code example "' + container.name + '"',
     '(http://runnable.com/' + utils.encodeId(container._id) + '/' + container.name + ')',
     'has been flagged and delisted from',
     'Runnable for one of the following reasons:'].join(' '),
    '  - Title doesn\'t adequately describe the example',
    '  - Code example does not Run',
    '  - Code example is a duplicate of an existing code example',
    '  - Code example is abusive of the Runnable Infrastructure',
    '  - Code example is offensive to the Runnable community\n',
    ['To allow others to find your code on Runnable again, please update it to',
     'address the reasons stated above and re-add the relevant tags. You can',
     'reply to this email if you have any questions or would like to know the',
     'specific reason for delisting your Code Example.'].join(' '),
    'Thanks,',
    'The Runnable Team'].join('\n');
  return {
    subject: subject,
    body: body
  };
}