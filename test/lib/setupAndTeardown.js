var db = require('./db');
// BEFORE ALL
db.onceConnected(db.removeCollections);
// AFTER ALL
process.on('exit', db.dropDatabase);