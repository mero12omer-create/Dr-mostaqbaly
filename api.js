const serverless = require("serverless-http");
const app = require("../../server.js");

module.exports.handler = serverless(app, {
  request: (request, event, context) => {
    request.netlifyEvent = event;
    request.netlifyContext = context;
  },
});
