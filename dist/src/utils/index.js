"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const isMissingSymlinkPermission = (error) => {
    // Generally happens when no admin rights with UAC enabled on Windows.
    return error.code === 'EPERM' && error.errno === -4048;
};
const copyIfMissingSymlinkPermission = (srcpath, dstpath, error) => {
    if (isMissingSymlinkPermission(error)) {
        fs.copySync(srcpath, dstpath);
    }
    else {
        throw error;
    }
};
exports.symlink = (srcpath, dstpath, type) => {
    try {
        fs.symlinkSync(srcpath, dstpath, type);
    }
    catch (error) {
        copyIfMissingSymlinkPermission(srcpath, dstpath, error);
    }
};
//# sourceMappingURL=index.js.map