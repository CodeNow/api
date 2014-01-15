var specifications = require('../models/specifications');
var express = require('express');
var app = module.exports = express();
app.post('/specifications', function (req, res) {
  specifications.createSpecification(req.domain, {
    userId: req.user_id,
    name: req.body.name,
    description: req.body.description,
    instructions: req.body.instructions,
    requirements: req.body.requirements
  }, req.domain.intercept(function (specification) {
    res.json(201, specification);
  }));
});
app.get('/specifications', function (req, res) {
  specifications.listSpecifications(req.domain, req.domain.intercept(function (specifications) {
    res.json(specifications);
  }));
});
app.get('/specifications/:id', function (req, res) {
  specifications.getSpecification(req.domain, req.params.id, req.domain.intercept(function (specification) {
    res.json(specification);
  }));
});
app.put('/specifications/:id', function (req, res) {
  specifications.updateSpecification(req.domain, {
    userId: req.user_id,
    specificationId: req.params.id,
    name: req.body.name,
    description: req.body.description,
    instructions: req.body.instructions,
    requirements: req.body.requirements
  }, req.domain.intercept(function (specification) {
    res.json(specification);
  }));
});
app.del('/specifications/:id', function (req, res) {
  specifications.deleteSpecification(req.domain, {
    userId: req.user_id,
    specificationId: req.params.id
  }, req.domain.intercept(function () {
    res.json({ message: 'specification deleted' });
  }));
});