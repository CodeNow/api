var express = require('express');
var mailchimp = require('mailchimp');
var Email = require('email').Email;
var configs = require('../configs');
var mailchimpApi = configs.mailchimp != null ? new mailchimp.MailChimpAPI(configs.mailchimp.key) : void 0;
var app = module.exports = express();
if (mailchimpApi != null) {
  Object.keys(configs.mailchimp.lists).forEach(function (list) {
    app.post('/campaigns/' + list, function (req, res) {
      var opts = {
        id: configs.mailchimp.lists[list],
        email_address: req.body.EMAIL,
        merge_vars: req.body,
        send_welcome: false,
        update_existing: false,
        double_optin: false
      };
      mailchimpApi.listSubscribe(opts, function (err) {
        if (err) {
          res.json(400, { message: err.message });
        } else {
          res.json(201, req.body);
        }
      });
    });
  });
}
app.post('/request/improve', function (req, res, next) {
  var requestEmailBody = 'Improve Description: \n[\n\t' + req.body.description + '\n]\n\n' + 'sender url: \n[\n\t' + req.body.url + '\n]';
  var requestEmail = new Email({
    from: 'newsuggestsions@runnable.com',
    to: 'praful@runnable.com',
    cc: [
      'sundip@runnable.com',
      'yash@runnable.com'
    ],
    subject: 'New Improve Request',
    body: requestEmailBody
  });
  requestEmail.send(function (err) {
    if (!err) {
      res.json({ response: 'thanks. Will get back to you soon.' });
    } else {
      console.error('ERROR sending new request mail', err);
      res.json({ response: 'Sorry. Will get back to you soon.' });
    }
  });
});