import esbuild from "esbuild";

const production = process.argv.includes("production");

await esbuild.build({
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  platform: "browser",
  target: "es2018",
  outfile: "main.js",
  sourcemap: production ? false : "inline",
  minify: production,
  banner: {
    js: "/*! PRG Viewer | MIT License | Copyright (c) 2026 woolaof */",
  },
  logLevel: "info",
});
