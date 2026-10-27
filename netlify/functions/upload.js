// Spreadsheet upload is no longer a way into the app. Weights are entered
// on the weigh screen, which can use any past date.
const { json } = require('./lib/db');

exports.handler = async () => json(410, { error: 'Spreadsheet upload has been removed. Enter weights on the weigh screen.' });
