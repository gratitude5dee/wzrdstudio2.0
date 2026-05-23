const Module = require("module");
const path = require("path");

const canvasStubPath = path.resolve(__dirname, "canvas-stub.cjs");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request === "canvas") {
    return canvasStubPath;
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};
