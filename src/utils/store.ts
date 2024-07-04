const path = require("path");
const fs = require("fs");

const DIR = path.join(__dirname, "../store");

export const load = (filename) => {
  try {
    filename = path.join(DIR, filename + ".json");
    const data = JSON.parse(fs.readFileSync(filename, "utf8"));
    return data;
  } catch (er) {
    return null;
  }
};

export const save = (filename, data) => {
  try {
    fs.mkdirSync(DIR);
  } catch (er) {
    return;
  }
  filename = path.join(DIR, filename + ".json");
  data = JSON.stringify(data, null, 2);
  return fs.writeFileSync(filename, data, "utf8");
};
