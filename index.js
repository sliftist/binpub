#!/usr/bin/env node
// This file cannot have carriage returns in the first line.
const yargs = require("yargs");
const tmp = require("tmp");
const fs = require("fs");
const child_process = require("child_process");
const simpleGit = require("simple-git");
const chalk = require("chalk");

const lightness = 58;
const blue = chalk.hsl(235, 100, lightness).bind(chalk);
const red = chalk.hsl(0, 100, lightness).bind(chalk);
const green = chalk.hsl(120, 100, lightness).bind(chalk);
const yellow = chalk.hsl(60, 100, lightness).bind(chalk);

// node . init clang-wasm --bins clang --addFiles wasm-ld
// node . add clang-wasm

let cleanupCallbacks = [];

const sourcesStartTag = `// AUTO_GENERATED_SOURCES_START`;
const sourcesEndTag = `// AUTO_GENERATED_SOURCES_END`;

yargs
.command("init [name]", "initialize the repo", () => {}, (argObj) => {
    init(argObj);
})
    .required("name", { describe: "The name of the package we will create." })
    .option("repoFolder", { describe: "Path to folder containing .git repo the for the overarching shim. Needed to maintain a list of per system packages, and to pull request new packages." })
    .option("incrementMinorVersion", { alias: "minor", description: "Increment the minor version instead of the patch version." })
    .option("incrementMajorVersion", { alias: "major", description: "Increment the major version instead of the minor or patch version." })
    .option("binaryNames", { alias: "bins", type: "array", default: [], describe: "Space delimited list of binary names." })
    .option("additionalFiles", { alias: "addFiles", type: "array", default: [], describe: "Additional files this binary requires to run, specified here so our add command can automatically look for them." })
    //.option("workingDirectory", { alias: "dir", describe: "Directory files will be placed in while working. If not specified an temporary directory will be used, and then deleted when done." })
    .option("dontPublish", { alias: "nopub", describe: "Suppresses publishing and pushing, allowing the user to publish manually by entering the working directory and running publish.sh." })
    .option("gitSource", { alias: "g", describe: "A source PURELY for humans, used to make it easier for humans to find the original source." })
    .option("urlSource", { alias: "s", describe: "The source where the binaries are distributed, or the homepage of the project." })
    .option("showArgs", { describe: "Prints the arguments as we received them." })

.command("repub [name]", "clones and then republishes the repo, not making any changes", () => {}, (argObj) => {
    repub(argObj);
})
    .required("name", { describe: "The name of the package we will create." })
    .option("repoFolder", { describe: "Path to folder containing .git repo the for the overarching shim. Needed to maintain a list of per system packages, and to pull request new packages." })

.command("add [name]", "add binaries to repo", () => {}, (argObj) => {
    add(argObj).then(() => {
        for(let callback of cleanupCallbacks) {
            callback();
        }
        // Oops... something is dangling. I think it is the spawn of the browser, even though that should have forked anyway?
        //  Maybe it is some other exec we called?
        process.exit();
    }, (err) => {
        console.error(err);
        for(let callback of cleanupCallbacks) {
            callback();
        }
        process.exit();
    });
})
    .required("name", { describe: "The package name from the overarching package." })
    .option("binaryPath", { describe: "Path to the binary, defaults to using 'where/which' to find it." })
    .option("workspaceFolder", { alias: "folder", describe: "A path that we can use as a workspace. We will create a folder in this and leave all of our intermediate files in that folder. Required if dontPublish is passed." })
    .option("packageName", { describe: "The overarching package that maintains versions of this binary. Defaults to name`" })
    .option("subPackageName", { alias: "subName", describe: "The name of the new system specific package we will be creating." })
    .option("additionalFiles", { alias: "addFiles", type: "array", default: [], describe: "Space delimited list of extra file names. These can be paths, or names, in which case we search for them beside the main executable." })
    //.option("workingDirectory", { alias: "dir", describe: "Directory files will be placed in while working. If not specified an temporary directory will be used, and then deleted when done." })
    .option("dontPublish", { alias: "nopub", describe: "Suppresses publishing and pushing, allowing the user to publish manually by entering the working directory and running publish.sh." })
    .option("versionOverride", { alias: "version", describe: "Overrides autodiscovery of version, which is used as the version of the subpackage." })
    .option("versionOverrideForceUpdate", { alias: "fupdate", describe: "Sets the version to the current version of the package, with the patch version incremented by 1. This allows forceful update when the underlying version hasn't changed, but the deployed package is incorrect." })
    .option("incrementMinorVersion", { alias: "minor", description: "(FOR THE OVER PACKAGE) Increment the minor version instead of the patch version." })
    .option("incrementMajorVersion", { alias: "major", description: "(FOR THE OVER PACKAGE) Increment the major version instead of the minor or patch version." })

.wrap(yargs.terminalWidth())
.argv
;

function Deferred() {
    this.resolve = null;
    this.reject = null;
    this.promise = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
    });
    this.handler = (err, result) => {
        if(err) { this.reject(err) }
        else { this.resolve(result); }
    };
}
function run(name, args, options = {}) {
    return child_process.execFileSync(name, args, options).toString().trim();
}
async function exec(name, args, options = {}) {
    let proc = child_process.execFile(name, args, { ...options, shell: true, stdio: ["inherit", "pipe", "pipe"] });
    proc.stdout.on("data", data => {
        console.log(data);
    });
    proc.stdout.on("error", data => {
        console.log(data);
    });
    proc.stderr.on("data", data => {
        console.log(data);
    });
    proc.stderr.on("error", data => {
        console.log(data);
    });
    
    await new Promise((resolve, reject) => {
        proc.on("error", (err) => {
            reject(err);
        });
        proc.on("exit", (code) => {
            if(code) {
                reject(code);
            } else {
                resolve();
            }
        });
    });
}

function groupEnd() {
    console.groupEnd();
    console.log();
}
function unique(array) {
    let lookup = {};
    for(let key of array) {
        lookup[key] = true;
    }
    return Object.keys(lookup);
}

async function repub(argObj) {
    let name = argObj.name;
    argObj.repoFolder = argObj.repoFolder || (__dirname + "/../" + name);

    let repoFolder = argObj.repoFolder + "/";
    if(!fs.existsSync(repoFolder + ".git")) {
        throw new Error(`Cannot find git repo at "${repoFolder + ".git"}"`);
    }

    await exec("git", ["add", "--all"], {cwd: repoFolder});
    await exec("git", ["stash"], {cwd: repoFolder});
    await exec("git", ["fetch"], {cwd: repoFolder});
    await exec("git", ["merge", "-X", "theirs", "origin/master"], { cwd: repoFolder });
    await exec("npm", ["publish"], {cwd: repoFolder});
}

async function init(argObj) {
    let name = argObj.name;

    argObj.repoFolder = argObj.repoFolder || (__dirname + "/../" + name);

    let repoFolder = argObj.repoFolder + "/";
    if(!fs.existsSync(repoFolder + ".git")) {
        throw new Error(`Cannot find git repo at "${repoFolder + ".git"}"`);
    }

    let gitSource = argObj.gitSource;
    if(gitSource) {
        if(!gitSource.endsWith(".git")) {
            throw new Error(`gitSource must end with .git. You should probably use urlSource instead`);
        }
    }
    fs.writeFileSync("./rerun.json", JSON.stringify(process.argv.slice(2).concat("--showArgs")));
    if(argObj.showArgs) {
        console.log("Arguments: " + process.argv.slice(2).join(" "));
    }
    let path = __dirname.replace(/\\/g, "/") + "/index.js";
    fs.writeFileSync("./" + "rerun.js",
`let args = ["${path}"].concat(JSON.parse(require("fs").readFileSync("./rerun.json")));
require("child_process").execFileSync("node", args, { stdio: "inherit" });`
);


    let packageName = name;
    let packagePath = repoFolder + "package.json";


    let packageObj = {};
    try {
        packageObj = JSON.parse(fs.readFileSync(packagePath));
    } catch(e) {
        console.log(yellow(`Failed to parse package.json, replacing it`), e);
    }
    packageObj.name = packageObj.name || packageName;
    if(!packageObj.version) {
        packageObj.version = "0.0.0";
    } else {
        let parts = packageObj.version.split(".").slice(0, 3);
        let index = 2;
        if(argObj.incrementMinorVersion) {
            index = 1;
        }
        if(argObj.incrementMajorVersion) {
            index = 0;
        }
        parts[index] = (+parts[index] || 0) + 1;
        packageObj.version = parts.join(".");
    }
    packageObj.description = packageObj.description || `Binary publish of ${name}.`;
    packageObj.main = packageObj.main || "index.js";

    packageObj.binaryNames = packageObj.binaryNames || [];
    packageObj.binaryNames = unique(packageObj.binaryNames.concat(argObj.binaryNames));
    let binaryNames = packageObj.binaryNames;


    packageObj.additionalFiles = packageObj.additionalFiles || [];
    packageObj.additionalFiles = unique(packageObj.additionalFiles.concat(argObj.additionalFiles));

    let files = packageObj.files || [];

    let sourcesPath = repoFolder + "sources.js";
    let shimPath = repoFolder + "index.js";
    let readmePath = repoFolder + "README.md";
    // (Don't publish the publish path file)
    let publishPath = repoFolder + "publish.sh";
    files.push("sources.js", "index.js", "README.md");

    
    let gitObj = simpleGit(repoFolder);

    let getRemotesResult = new Deferred();
    gitObj.getRemotes(true, getRemotesResult.handler);
    let result = await getRemotesResult.promise;

    let repoPath = result.filter(x => x.name === "origin").map(x => x.refs.push)[0];
    if(repoPath) {
        packageObj.repository = repoPath;
    }
    if(!packageObj.author) {
        let name = run("git", ["config", "--global", "user.name"])
        let email = run("git", ["config", "user.email"]);
        packageObj.author = `${name} <${email}>`;
    }

    if(!fs.existsSync(readmePath)) {
        let readmeText = `Autogenerated readme. Allows use of ${name} via an npm package install, for use in cross platform scripts. Not affiliated with the ${name} project in any way.`;
        if(argObj.gitSource) {
            readmeText += ` The source for the original binary is available at ${argObj.gitSource}`;
        }
        if(argObj.urlSource) {
            readmeText += ` The site for the original binary is available at ${argObj.urlSource}`;
        }
        fs.writeFileSync(readmePath, readmeText);
    }

    if(!fs.existsSync(sourcesPath)) {
        fs.writeFileSync(sourcesPath, 
`module.exports = {};
module.exports.sources = function sources() {
    /** @type {
        [packageName: string]: {
            // Ex, { platform: "win32", arch: "x64" }. Every key is mapped to process[key]
            //  and checked to see if this matches the current system
            jsSystemInfo: { [key: string]: unknown };
            // Exact name of npm package
            packageName: string;
            binaries: {
                // Maps to the name of file inside the package.
                [binaryName: string]: string
            }
        }
    } */
    return (
        // Autogenerated. Don't modify this manually.
${sourcesStartTag}
{ }
${sourcesEndTag}
    )
    ;
};`);
    }

    packageObj.bin = packageObj.bin || {};
    for(let binName of binaryNames) {
        let jsName = binName + ".js";
        if(binName === binaryNames[0] && binName !== name) {
            packageObj.bin[name] = jsName
        }
        files.push(jsName);
        packageObj.bin[binName] = jsName;
        fs.writeFileSync(repoFolder + "/" + jsName,
`#!/usr/bin/env node
let path = require("./index.js").getBinaryPath("${binName}");
let args = process.argv.slice(2);
require("child_process").execFileSync(path, args, { stdio: "inherit" });
`.replace(/\r/g, ""));
    }
    

    fs.copyFileSync(__dirname + "/" + "shim.js", shimPath);

    packageObj.urlSource = packageObj.urlSource || argObj.urlSource;
    packageObj.gitSource = packageObj.gitSource || argObj.gitSource;

    let filesObj = {};
    for(let file of files) {
        filesObj[file] = true;
    }
    packageObj.files = Object.keys(filesObj);
    fs.writeFileSync(packagePath, JSON.stringify(packageObj, null, 4));

    {
        let result = new Deferred();
        gitObj.add("--all", result.handler);
        await result;
    }
    {
        let result = new Deferred();
        gitObj.commit("init/config update (AUTO GENERATED COMMIT)", [], {}, result.handler);
        await result.promise;
    }
    
    fs.writeFileSync(publishPath, 
`git push
npm publish`
    );
    if(!argObj.dontPublish) {
        console.log(`Publishing (running "bash ${publishPath}")`);
        await exec("bash", [publishPath], { cwd: repoFolder });
    } else {
        console.log(`Not publishing (run "bash ${publishPath}" to publish)`);
    }
}

async function add(argObj) {
    let name = argObj.name;


    argObj.workspaceFolder = argObj.workspaceFolder || (require("os").tmpdir());

    let workspace = require("path").resolve(argObj.workspaceFolder).replace(/\\/g, "/") + "/";
    if(!workspace) {
        if(argObj.dontPublish) {
            throw new Error(`dontPublish is only supported if the workspaceFolder option is set`);
        }
        let tmpObj = tmp.dirSync();
        cleanupCallbacks.push(() => tmpObj.removeCallback());
        workspace = tmpObj.name;
    }
    if(!fs.existsSync(workspace)) {
        fs.mkdirSync(workspace);
    }

    let overPackageName = name;

    workspace = workspace + "/" + name + "_workspace/";

    console.log(blue(`Using workspace ${workspace}`));
    
    if(!fs.existsSync(workspace)) {
        fs.mkdirSync(workspace);
    }

    let overConfig;
    console.group(blue(`Install and download of ${overPackageName}`));
    {
        if(!fs.existsSync(workspace + "/package.json")) {
            fs.writeFileSync(workspace + "/package.json", "{}");
        }

        await exec("npm", ["install", "--save", overPackageName + "@latest"], { cwd: workspace });

        overConfig = JSON.parse(fs.readFileSync(workspace + "/node_modules/" + overPackageName + "/package.json"));
    }
    groupEnd();


    let subpackageName = argObj.subPackageName;

    // Try to see if there are any existing packages which are compatible with the current system.
    if(!subpackageName) {
        let sourcesModule = require(workspace + "/node_modules/" + overPackageName + "/sources.js");
        let prevSources = sourcesModule.sources();
        for(let otherSubPackageName in prevSources) {
            let { jsSystemInfo } = prevSources[otherSubPackageName];
            let matched = true;
            for(let key in jsSystemInfo) {
                if(process[key] !== jsSystemInfo[key]) {
                    matched = false;
                    break;
                }
            }
            if(matched) {
                subpackageName = otherSubPackageName;
                break;
            }
        }
    }
    if(!subpackageName) {
        // We remove everything after the first -, because of npm spack detection.
        //  https://stackoverflow.com/questions/48668389/npm-publish-failed-with-package-name-triggered-spam-detection
        subpackageName = (name.split(/-/g)[0] + "-" + process.platform + "-" + process.arch);
    }


    let versionUnchanged = false;
    let subConfig = {};
    let binaryNamesMap = {};
    let subWorkspace = require("path").resolve(workspace + "/node_modules/" + subpackageName + "/").replace(/\\/g, "/") + "/";
    console.group(blue(`Install/update of subPackage ${subpackageName}`));
    {
        let foundSubpackage = false;
        try {
            await exec("npm", ["install", "--save", subpackageName  + "@latest"], { cwd: workspace });
            foundSubpackage = true;
        } catch(e) {
            console.log(yellow(`\nCould not find previous version of this subpackage. Assuming this is the first version.`));
        }

        if(foundSubpackage) {
            subConfig = JSON.parse(fs.readFileSync(workspace + "/node_modules/" + subpackageName + "/package.json"));
        } else {
            if(argObj.versionOverrideForceUpdate) {
                throw new Error(`Cannot use versionOverrideForceUpdate (fupdate) on the first release of the package (and we can't find an existing version of ${subpackageName})`);
            }
        }

        if(!fs.existsSync(subWorkspace)) {
            fs.mkdirSync(subWorkspace);
        }

        subConfig.name = subConfig.name || subpackageName;

        let mainBinaryName = overConfig.binaryNames[0];

        let binaryPath = argObj.binaryPath;
        if(!binaryPath) {
            let where = process.platform === "win32" ? "where" : "which";
            binaryPath = run(where, [mainBinaryName]).split(/\r\n|\n/)[0];
            binaryPath = binaryPath.replace(/\\/g, "/");

            console.log(green(`Found binary at ${binaryPath}`));
        }

        let newVersion = argObj.versionOverride;
        if(argObj.versionOverrideForceUpdate) {
            let parts = subConfig.version.split(".").slice(0, 3);
            let index = 2;
            parts[index] = (+parts[index] || 0) + 1;
            newVersion = parts.join(".");
        } else if(!newVersion) {
            let versionOutput = run(binaryPath, ["--version"]);
            newVersion = versionOutput.match(/([0-9]\.)*[0-9]/)[0];
        }


        subConfig.description = `Autogenerated package.json for ${name} (only redistribution of the binaries as an npm package, not affiliated with the project in any way).`
        console.log(blue(`Going from version ${subConfig.version} to ${newVersion}`))
        if(subConfig.version === newVersion) {
            versionUnchanged = true;
        }
        subConfig.version = newVersion;

        if(!subConfig.author) {
            let name = run("git", ["config", "--global", "user.name"]);
            let email = run("git", ["config", "user.email"]);
            subConfig.author = `${name} <${email}>`;
        }

        subConfig.homepage = overConfig.urlSource;
        if(overConfig.gitSource) {
            subConfig.repository = {
                type: "git",
                url: overConfig.gitSource,
            };
        }

        subConfig.os = [process.platform];
        subConfig.cpu = [process.arch];

        binaryPath = binaryPath.replace(/\\/g, "/");
        let binaryFolder = binaryPath.split("/").slice(0, -1).join("/") + "/";

        let additionalFiles = [];
        subConfig.files = subConfig.files || [];

        function findFile(nameOrPath) {
            nameOrPath = nameOrPath.replace(/\\/g, "/");
            let paths = [nameOrPath, binaryFolder + nameOrPath, binaryFolder + nameOrPath + ".exe"];
            for(let path of paths) {
                if(fs.existsSync(path)) {
                    return path;
                }
            }
            throw new Error(`Cannot find ${nameOrPath}. Looked at ${JSON.stringify(paths)}`);
        }

        for(let binaryName of overConfig.binaryNames.concat(overConfig.additionalFiles || []).concat(argObj.additionalFiles || [])) {
            let path = findFile(binaryName);
            let fileName = path.split("/").slice(-1)[0];
            if(overConfig.binaryNames.includes(binaryName)) {
                binaryNamesMap[binaryName] = fileName;
            }
            additionalFiles.push(fileName);
            subConfig.files.push(fileName);
            fs.copyFileSync(path, subWorkspace + "/" + fileName);
        }

        subConfig.main = "index.js";

        fs.writeFileSync(subWorkspace + "/index.js", `
let namesMap = ${JSON.stringify(binaryNamesMap)};
module.exports = {
    getBinaryPath(name) {
        return __dirname + "/" + namesMap[name];
    }
};
`);
        subConfig.files.push("index.js");


        let filesObj = {};
        for(let file of subConfig.files) {
            filesObj[file] = true;
        }
        subConfig.files = Object.keys(filesObj);

        fs.writeFileSync("README.md", subConfig.description + `. Not affiliated with ${name} in any way. Part of the ${overPackageName} package (which is also not affiliated with ${name}).`);

        fs.writeFileSync(subWorkspace + "/package.json", JSON.stringify(subConfig, null, 4));

    }
    groupEnd();



    
    let overRepo = overConfig.repository.url;
    let userName = run("git", ["config", "--global", "user.name"]);

    console.log(green(`Found git username as "${userName}", assuming this is your github username (if it isn't, the next few steps won't work properly). You can change it with "git config --global user.name 'your-preferred-username'".`));

    console.group(blue(`Syncing base repo (${overRepo})`));
    let usersForkUrl = `git@github.com:${userName}/${name}.git`;
    let gitWorkspace;
    {
        {
            let repoName = overRepo.split(/[\.\/]/g).slice(-2)[0];
            if(!fs.existsSync(workspace + "/" + repoName + "/.git")) {
                await exec("git", ["clone", overRepo], { cwd: workspace });
            }
            gitWorkspace = require("path").resolve(workspace + "/" + repoName + "/").replace(/\\/g, "/") + "/";
        }

        let remotePushUrls = {};
        {
            let gitObj = simpleGit(gitWorkspace);
            let getRemotesResult = new Deferred();
            gitObj.getRemotes(true, getRemotesResult.handler);
            let result = await getRemotesResult.promise;
            for(let remoteObj of result) {
                // let repoPath = result.filter(x => x.name === "origin").map(x => x.refs.push)[0];
                if(remoteObj.refs.push) {
                    remotePushUrls[remoteObj.name] = remoteObj.refs.push;
                }
            }
        }

        // Clean up any previous pending changes
        await exec("git", ["add", "--all"], { cwd: gitWorkspace });
        await exec("git", ["stash"], { cwd: gitWorkspace });

        // Set up remotes

        let hasPushAccessToCurrentOrigin = false;
        try {
            // TODO: Make a dummy branch and dry run pushing that? Because this can fail for many reasons, not just
            //  not being allowed to push to current origin.
            await exec("git", ["pull"], { cwd: gitWorkspace });
            await exec("git", ["push", "--dry-run"], { cwd: gitWorkspace });
            hasPushAccessToCurrentOrigin = true;
        } catch(e) { }

        if(hasPushAccessToCurrentOrigin) {
            usersForkUrl = remotePushUrls.origin;
        }
        run("git", ["remote", remotePushUrls.origin ? "set-url" : "add", "origin", usersForkUrl], { cwd: gitWorkspace });
        run("git", ["remote", remotePushUrls.upstream ? "set-url" : "add", "upstream", overRepo], { cwd: gitWorkspace });

        // Forcefully make us identical to either origin or upstream, and then merge upstream into ours.
        {
            await exec("git", ["fetch", "upstream"], { cwd: gitWorkspace });

            // We throw out anything that is only local. But we need to preserve anything that is specific to the fork (but has been pushed),
            //  as they might have already made some changes, and want to add to those changes.
            // Also, no branches. If one person wants to add multiple system configs, then they want to do it on one branch, or else their
            //  pull requests will collide by default (as all requests change lines in the same location).
            
            // Either become exactly the origin, or exactly the upstream.
            let didResetToOrigin = false;
            try {
                await exec("git", ["fetch", "origin"], { cwd: gitWorkspace });
                await exec("git", ["reset", "--hard", "origin/master"], { cwd: gitWorkspace });
                didResetToOrigin = true;
            } catch(e) { }
            if(!didResetToOrigin) {
                await exec("git", ["reset", "--hard", "upstream/master"], { cwd: gitWorkspace });
            }

            // This is basically just a temporary repo, so there is no reason to keep local changes, always take remote changes.
            //  TODO: Consider being even more draconic, and just always wiping out our changes, as we only want this .git repo for one exact
            //  purpose, to change it's package.json and sources.js, and the changes to those should never vary.
            //  - Also, TODO: Maybe just make a remote script that makes the pull request, from an automated account, as we want to lower the barrier
            //      to making pull requests, and with a remote script we could get rid of the need to make a github account, or to even have git
            //      (they would still need npm and an npm account though... although maybe we could automate that too?).
            await exec("git", ["merge", "-X", "theirs", "upstream/master"], { cwd: gitWorkspace });
        }
    }
    groupEnd();


    console.group(blue(`Updating base repo config to point to our package`));
    {
        let sources = fs.readFileSync(gitWorkspace + "/sources.js").toString();
        let sourcesStartIndex = sources.indexOf(sourcesStartTag);
        if(sourcesStartIndex < 0) {
            throw new Error(`Can't find source tag in sources file. Looking for ${sourcesStartTag}. The repo ${overConfig.repository.url} is corrupted.`);
        }
        sourcesStartIndex += sourcesStartTag.length;

        let sourcesEndIndex = sources.indexOf(sourcesEndTag);
        if(sourcesEndIndex < 0) {
            throw new Error(`Can't find source tag in sources file. Looking for ${sourcesEndTag}. The repo ${overConfig.repository.url} is corrupted.`);
        }

        let sourcesJSON = sources.slice(sourcesStartIndex, sourcesEndIndex);
        let sourcesObj = JSON.parse(sourcesJSON);
        sourcesObj[subpackageName] = {
            jsSystemInfo: { platform: process.platform, arch: process.arch },
            packageName: subpackageName,
            binaries: binaryNamesMap,
        };

        sources = sources.slice(0, sourcesStartIndex) + "\n" + JSON.stringify(sourcesObj, null, 4) + "\n" + sources.slice(sourcesEndIndex);

        fs.writeFileSync(gitWorkspace + "/sources.js", sources);


        let gitConfig = JSON.parse(fs.readFileSync(gitWorkspace + "package.json"));

        // Also update the package.json in gitWorkspace, to have subpackageName as an optional dependency.
        gitConfig.optionalDependencies = gitConfig.optionalDependencies || {};
        // Explicit version, as it is unlikely random binaries are even semver.
        // TODO: Add an option to not use an explicit verison, and to not even update the version!
        gitConfig.optionalDependencies[subpackageName] = subConfig.version;

        // And increment the version in gitWorkspace.
        {
            let parts = gitConfig.version.split(".").slice(0, 3);
            let index = 2;
            if(argObj.incrementMinorVersion) {
                index = 1;
            }
            if(argObj.incrementMajorVersion) {
                index = 0;
            }
            parts[index] = (+parts[index] || 0) + 1;
            gitConfig.version = parts.join(".");
        }

        fs.writeFileSync(gitWorkspace + "package.json", JSON.stringify(gitConfig, null, 4));
    }
    groupEnd();

    console.group(blue(`Make change commit`));
    {
        await exec("git", ["add", "--all"], { cwd: gitWorkspace });
        let statusText = run("git", ["status", "--porcelain"], { cwd: gitWorkspace }).trim();
        if(statusText) {
            await exec("git", ["commit", "-m", `"Version ${subConfig.version}"`], { cwd: gitWorkspace });
        }
    }
    groupEnd();

    let pullRequestUrl = "";
    let launchBrowserCommand = undefined;
    if(usersForkUrl !== overRepo) {
        console.group(blue(`Setting up pull request to base repo`));
        let originRepoExists = false;
        try {
            await exec("git", ["push", "--dry-run"], { cwd: gitWorkspace });
            originRepoExists = true;
        } catch(e) { }

        if(process.platform === "win32") {
            launchBrowserCommand = { cmd: "explorer", args: ["URL_PLACEHOLDER"] };
        } else if (process.platform === "darwin") {
            launchBrowserCommand = { cmd: "open", args: ["URL_PLACEHOLDER"] };
        } else if (process.platform === "linux") {
            launchBrowserCommand = { cmd: "xdg-open", args: ["URL_PLACEHOLDER"] };
        }

        let urlParsed = overRepo.slice(0, -".git".length);
        let urlParts = urlParsed.split("/").slice(-2);
        let overUserName = urlParts[0];
        let overName = urlParts[1];
        if(!originRepoExists) {

            let repoGithubUrl = `https://github.com/${overUserName}/${overName}`;
            
            if(!launchBrowserCommand) {
                console.log(error(`Cannot launch a browser. Ensure ${usersForkUrl} exists, as we failed to push to ${overRepo} and so setup pushing to a fork (that doesn't appear to exist) at ${usersForkUrl}.`));
            } else {
                while(true) {
                    console.log(blue(`\nYou must make a fork of the underlying repo to make your changes. A browser will be opened in a few seconds. CLICK FORK, come back here, and press enter.`));
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    try {
                        // For some reason explorer gives a status code of 1. I assume it is trying to hint that it couldn't open the webpage,
                        //  but got another application to. So... ignore that, only complain about an error if we get an error message.
                        let proc = child_process.spawnSync(launchBrowserCommand.cmd, launchBrowserCommand.args.map(x => x.replace(/URL_PLACEHOLDER/g, repoGithubUrl)));
                        let error = proc.stderr.toString();
                        if(error) {
                            throw error;
                        }
                    } catch(e) {
                        console.log(e);
                        console.log(red(`Failed to launch a browser. Ensure ${usersForkUrl} exists, as we failed to push to ${overRepo} and so setup pushing to a fork (that doesn't appear to exist) at ${usersForkUrl}.`));
                    }

                    console.info(blue(`\nPress any key once the repo ${usersForkUrl} exists, and can be pushed to.`));
                    await new Promise(resolve => process.stdin.once("data", resolve));

                    try {
                        await exec("git", ["push", "--dry-run"], { cwd: gitWorkspace });
                        // TODO: BUG: This line is being reached even when there is definitely an error (at least on OSX).
                        console.info(blue(`\nFork detected correctly.`));
                        break;
                    } catch(e) { }
                }
            }
        }

        pullRequestUrl = `https://github.com/${userName}/${overName}/pulls`;
        groupEnd();
    }

    if(argObj.dontPublish) {
        // Then don't psuh to the fork even
    }
    else if(!argObj.dontPublish && !versionUnchanged) {
        // We will be calling npm publish right away, which fails so frequently due to spam detect that is pays to delay
        //  the push until we know the npm publish worked.
    } else {
        if(usersForkUrl !== overRepo) {
            console.group(blue("Pushing to fork"));
            await exec("git", ["push"], { cwd: gitWorkspace });
            groupEnd();
        }
    }


    console.group(blue(`Publishing`));
    {
        if(versionUnchanged) {
            console.log(yellow(`Package version has not changed (${subConfig.version}). We can't publish unless the version changes. Use --subName to use a different name OR pass --fupdate to forcefully update the version (but warning, this will cause the version to differ from the underlying binary version, creating a new version that is only meaningful within npm).`));
        }

        if(!argObj.dontPublish) {
            if(versionUnchanged) {
                process.exit();
            }
            if(!versionUnchanged) {
                await exec("npm", ["publish", `"${subWorkspace}"`], { });
                await exec("git", ["push"], { cwd: gitWorkspace });
            }
            if(pullRequestUrl) {
                if(launchBrowserCommand) {
                    console.log(green(`NPM package created called ${subpackageName}, and fork pushed to. Opening pull request page at ${pullRequestUrl}`));
                    child_process.spawnSync(launchBrowserCommand.cmd, launchBrowserCommand.args.map(x => x.replace(/URL_PLACEHOLDER/g, pullRequestUrl)));
                } else {
                    console.log(yellow(`\nNPM package created called ${subpackageName}, and fork pushed to. YOU MUST MANUALLY PULL REQUEST the main repo at ${pullRequestUrl}`));
                }
            } else {
                await exec("git", ["push"], { cwd: gitWorkspace });

                console.log(green(`\nNPM package created called ${subpackageName}, and repo ${overRepo} pushed to.`));
            }
        } else {
            console.log(green(`Done setup. Publish the sub package with`));
            console.log(blue(`\tnpm publish ${subWorkspace}`));
            if(usersForkUrl === overRepo) {
                console.log(green(`Push to the main repo with`));
                console.log(blue(`\tcd "${gitWorkspace}" && git push`));
            }
            else {
                console.log(green(`Push to your fork with`));
                console.log(blue(`\tcd "${gitWorkspace}" && git push`));
                console.log(green(`Pull request it to the main repo by visiting`));
                console.log(blue(`\t${pullRequestUrl}`));
            }
        }
    }
    groupEnd();
}