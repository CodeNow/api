var db = require('./db');
// BEFORE ALL
db.onceConnected(db.dropCollections);
// AFTER ALL
process.on('exit', db.dropDatabase);