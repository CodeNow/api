var users = require('middleware/users');
var specifications = require('middleware/specifications');
var body = require('middleware/body');
var params = require('middleware/params');
var utils = require('middleware/utils');
var express = require('express');
var app = module.exports = express();

app.post('/',
  users.isVerified,
  body.require('name', 'requirements'),
  specifications.findConflict({
    name: 'body.name'
  }),
  body.pick('name', 'description', 'instructions', 'requirements'),
  specifications.create('body'),
  specifications.save,
  specifications.respond);

app.get('/',
  specifications.find,
  specifications.respond);

app.get('/:specificationId',
  params.isObjectId('specificationId'),
  specifications.findById('params.specificationId'),
  specifications.respond);

// var updateSpecification = series(
//   params.isObjectId('specificationId'),
//   specifications.findById('params.specificationId'),
//   specifications.specification.update('body');
//   )


// app.post('/specifications', function (req, res) {
//   specifications.createSpecification(req.domain, {
//     userId: req.user_id,
//     name: req.body.name,
//     description: req.body.description,
//     instructions: req.body.instructions,
//     requirements: req.body.requirements
//   }, req.domain.intercept(function (specification) {
//     res.json(201, specification);
//   }));
// });
// app.get('/specifications', function (req, res) {
//   specifications.listSpecifications(req.domain, req.domain.intercept(function (specifications) {
//     res.json(specifications);
//   }));
// });
// app.get('/specifications/:id', function (req, res) {
//   specifications.getSpecification(req.domain,
//     req.params.id,
//     req.domain.intercept(function (specification) {
//       res.json(specification);
//     }));
// });
// app.put('/specifications/:id', function (req, res) {
//   specifications.updateSpecification(req.domain, {
//     userId: req.user_id,
//     specificationId: req.params.id,
//     name: req.body.name,
//     description: req.body.description,
//     instructions: req.body.instructions,
//     requirements: req.body.requirements
//   }, req.domain.intercept(function (specification) {
//     res.json(specification);
//   }));
// });
// app.del('/specifications/:id', function (req, res) {
//   specifications.deleteSpecification(req.domain, {
//     userId: req.user_id,
//     specificationId: req.params.id
//   }, req.domain.intercept(function () {
//     res.json({ message: 'specification deleted' });
//   }));
// });