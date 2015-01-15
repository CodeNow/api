'use strict';

var fs = require('fs');

[
 'nodejs',
 'python',
 'ruby'
].forEach(function (lang) {
  console.log('lang', lang);
  console.log(__dirname);
  var json = require(__dirname + '/../lib/routes/actions/analyze/data/suggestable-services-'+lang);
  var fjson = {};
  Object.keys(json).sort().forEach(function (key) {
    fjson[key] = json[key];
    fjson[key] = fjson[key].sort();
  });
  fs.writeFileSync(__dirname + '/../lib/routes/actions/analyze/data/suggestable-services-'+lang+'.json',
                   JSON.stringify(fjson, null, ' '));
});
