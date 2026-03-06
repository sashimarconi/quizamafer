const createHandler = require('./pix/create');

module.exports = async function handler(req, res) {
  // forward to existing handler
  return createHandler(req, res);
};
