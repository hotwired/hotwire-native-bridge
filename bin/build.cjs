#!/usr/bin/env node

const esbuild = require("esbuild")
const package = require("../package.json")
const year = new Date().getFullYear()
const banner = `/*\nHotwire Native Bridge ${package.version}\nCopyright © ${year} 37signals LLC\n*/`

const options = {
  entryPoints: ["src/index.js"],
  bundle: true,
  minify: false,
  banner: { js: banner },
  external: ["@hotwired/stimulus"],
  format: 'esm',
  outfile: "dist/hotwire-native-bridge.js",
}

esbuild.build(options).catch(() => process.exit(1))
