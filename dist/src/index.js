"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs-extra");
const _ = require("lodash");
const globby = require("globby");
const typescript = require("./typescript");
const watchFiles_1 = require("./watchFiles");
const utils_1 = require("./utils");
// Folders
const serverlessFolder = '.serverless';
const buildFolder = '.build';
class TypeScriptPlugin {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;
        this.hooks = {
            'before:run:run': () => __awaiter(this, void 0, void 0, function* () {
                yield this.compileTs();
            }),
            'before:offline:start': () => __awaiter(this, void 0, void 0, function* () {
                yield this.compileTs();
                this.watchAll();
            }),
            'before:offline:start:init': () => __awaiter(this, void 0, void 0, function* () {
                yield this.compileTs();
                this.watchAll();
            }),
            'before:package:createDeploymentArtifacts': this.compileTs.bind(this),
            'after:package:createDeploymentArtifacts': this.cleanup.bind(this),
            'before:deploy:function:packageFunction': this.compileTs.bind(this),
            'after:deploy:function:packageFunction': this.cleanup.bind(this),
            'before:invoke:local:invoke': () => __awaiter(this, void 0, void 0, function* () {
                const emitedFiles = yield this.compileTs();
                if (this.isWatching) {
                    emitedFiles.forEach(filename => {
                        const module = require.resolve(path.resolve(this.originalServicePath, filename));
                        delete require.cache[module];
                    });
                }
            }),
            'after:invoke:local:invoke': () => {
                if (this.options.watch) {
                    this.watchFunction();
                    this.serverless.cli.log('Waiting for changes ...');
                }
            }
        };
    }
    get functions() {
        return this.options.function
            ? { [this.options.function]: this.serverless.service.functions[this.options.function] }
            : this.serverless.service.functions;
    }
    get rootFileNames() {
        return typescript.extractFileNames(this.originalServicePath, this.serverless.service.provider.name, this.functions);
    }
    prepare() {
        // exclude serverless-plugin-typescript
        const functions = this.functions;
        for (const fnName in functions) {
            const fn = functions[fnName];
            fn.package = fn.package || {
                exclude: [],
                include: [],
            };
            // Add plugin to excluded packages or an empty array if exclude is undefined
            fn.package.exclude = _.uniq([...fn.package.exclude || [], 'node_modules/serverless-plugin-typescript']);
        }
    }
    watchFunction() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isWatching) {
                return;
            }
            this.serverless.cli.log(`Watch function ${this.options.function}...`);
            this.isWatching = true;
            watchFiles_1.watchFiles(this.rootFileNames, this.originalServicePath, () => {
                this.serverless.pluginManager.spawn('invoke:local');
            });
        });
    }
    watchAll() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isWatching) {
                return;
            }
            this.serverless.cli.log(`Watching typescript files...`);
            this.isWatching = true;
            watchFiles_1.watchFiles(this.rootFileNames, this.originalServicePath, () => {
                this.compileTs();
            });
        });
    }
    compileTs() {
        return __awaiter(this, void 0, void 0, function* () {
            this.prepare();
            this.serverless.cli.log('Compiling with Typescript...');
            if (!this.originalServicePath) {
                // Save original service path and functions
                this.originalServicePath = this.serverless.config.servicePath;
                // Fake service path so that serverless will know what to zip
                this.serverless.config.servicePath = path.join(this.originalServicePath, buildFolder);
            }
            const tsconfig = typescript.getTypescriptConfig(this.originalServicePath, this.isWatching ? null : this.serverless.cli);
            tsconfig.outDir = buildFolder;
            const emitedFiles = yield typescript.run(this.rootFileNames, tsconfig);
            yield this.copyExtras();
            this.serverless.cli.log('Typescript compiled.');
            return emitedFiles;
        });
    }
    copyExtras() {
        return __awaiter(this, void 0, void 0, function* () {
            // include node_modules into build
            if (!fs.existsSync(path.resolve(path.join(buildFolder, 'node_modules')))) {
                utils_1.symlink(path.resolve('node_modules'), path.resolve(path.join(buildFolder, 'node_modules')));
            }
            // include package.json into build so Serverless can exlcude devDeps during packaging
            if (!fs.existsSync(path.resolve(path.join(buildFolder, 'package.json')))) {
                utils_1.symlink(path.resolve('package.json'), path.resolve(path.join(buildFolder, 'package.json')));
            }
            // include any "extras" from the "include" section
            if (this.serverless.service.package.include && this.serverless.service.package.include.length > 0) {
                const files = yield globby(this.serverless.service.package.include);
                for (const filename of files) {
                    const destFileName = path.resolve(path.join(buildFolder, filename));
                    const dirname = path.dirname(destFileName);
                    if (!fs.existsSync(dirname)) {
                        fs.mkdirpSync(dirname);
                    }
                    if (!fs.existsSync(destFileName)) {
                        fs.copySync(path.resolve(filename), path.resolve(path.join(buildFolder, filename)));
                    }
                }
            }
        });
    }
    moveArtifacts() {
        return __awaiter(this, void 0, void 0, function* () {
            yield fs.copy(path.join(this.originalServicePath, buildFolder, serverlessFolder), path.join(this.originalServicePath, serverlessFolder));
            if (this.options.function) {
                const fn = this.serverless.service.functions[this.options.function];
                const basename = path.basename(fn.package.artifact);
                fn.package.artifact = path.join(this.originalServicePath, serverlessFolder, path.basename(fn.package.artifact));
                return;
            }
            if (this.serverless.service.package.individually) {
                const functionNames = this.serverless.service.getAllFunctions();
                functionNames.forEach(name => {
                    this.serverless.service.functions[name].package.artifact = path.join(this.originalServicePath, serverlessFolder, path.basename(this.serverless.service.functions[name].package.artifact));
                });
                return;
            }
            this.serverless.service.package.artifact = path.join(this.originalServicePath, serverlessFolder, path.basename(this.serverless.service.package.artifact));
        });
    }
    cleanup() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.moveArtifacts();
            // Restore service path
            this.serverless.config.servicePath = this.originalServicePath;
            // Remove temp build folder
            fs.removeSync(path.join(this.originalServicePath, buildFolder));
        });
    }
}
exports.TypeScriptPlugin = TypeScriptPlugin;
module.exports = TypeScriptPlugin;
//# sourceMappingURL=index.js.map