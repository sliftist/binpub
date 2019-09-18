let args = ["C:/Users/quent/Dropbox/repos/binpub/index.js"].concat(JSON.parse(require("fs").readFileSync("./rerun.json")));
require("child_process").execFileSync("node", args, { stdio: "inherit" });