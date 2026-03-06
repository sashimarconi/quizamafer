const checkHandler = require('./pix/check');

module.exports = async function handler(req, res) {
  // forward to existing handler
  return checkHandler(req, res);
};
