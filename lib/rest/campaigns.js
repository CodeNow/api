var Email, configs, domains, express, mailchimp, mailchimpApi, _;
express = require('express');
mailchimp = require('mailchimp');
domains = require('../domains');
Email = require('email').Email;
configs = require('../configs');
_ = require('lodash');
mailchimpApi = configs.mailchimp != null ? new mailchimp.MailChimpAPI(configs.mailchimp.key) : void 0;
module.exports = function (parentDomain) {
  var app;
  app = module.exports = express();
  app.use(domains(parentDomain));
  if (mailchimpApi != null) {
    Object.keys(configs.mailchimp.lists).forEach(function (list) {
      return app.post('/campaigns/' + list, function (req, res) {
        var opts;
        opts = {
          id: configs.mailchimp.lists[list],
          email_address: req.body.EMAIL,
          merge_vars: req.body,
          send_welcome: false,
          update_existing: false,
          double_optin: false
        };
        return mailchimpApi.listSubscribe(opts, function (err) {
          if (err) {
            return res.json(400, { message: err.message });
          } else {
            return res.json(201, req.body);
          }
        });
      });
    });
  }
  return app.post('/request/improve', function (req, res, next) {
    var requestEmail, requestEmailBody;
    requestEmailBody = 'Improve Description: \n[\n\t' + req.body.description + '\n]\n\n' + 'sender url: \n[\n\t' + req.body.url + '\n]';
    requestEmail = new Email({
      from: 'newsuggestsions@runnable.com',
      to: 'praful@runnable.com',
      cc: [
        'sundip@runnable.com',
        'yash@runnable.com'
      ],
      subject: 'New Improve Request',
      body: requestEmailBody
    });
    return requestEmail.send(function (err) {
      if (!err) {
        return res.json({ response: 'thanks. Will get back to you soon.' });
      } else {
        console.error('ERROR sending new request mail', err);
        return res.json({ response: 'Sorry. Will get back to you soon.' });
      }
    });
  });
};