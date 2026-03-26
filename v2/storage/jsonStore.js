const fs = require("fs");
const path = require("path");

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function createJsonStore(filePath, fallbackValue) {
  return {
    filePath,
    fallbackValue,
    read() {
      return readJsonFile(filePath, fallbackValue);
    },
    write(value) {
      writeJsonFile(filePath, value);
    },
  };
}

module.exports = {
  readJsonFile,
  writeJsonFile,
  createJsonStore,
};
