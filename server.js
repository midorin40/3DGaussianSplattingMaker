const path = require("path");

process.env.GSM_APP_ROOT = path.join(__dirname, "v2");
process.env.GSM_DATA_ROOT = __dirname;

require("./v2/server.js");
