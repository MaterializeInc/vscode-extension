// file: esbuild.js

const { build } = require("esbuild");

const baseConfig = {
  bundle: true,
  minify: process.env.NODE_ENV === "production",
  sourcemap: process.env.NODE_ENV !== "production",
  format: "cjs",
};

const extensionConfig = {
  ...baseConfig,
  platform: "node",
  mainFields: ["module", "main"],
  entryPoints: ["./src/extension.ts"],
  outfile: "./out/extension.js",
  external: ["vscode"],
};
const watchConfig = {
    watch: {
      onRebuild(error, result) {
        console.log("[watch] build started");
        if (error) {
          error.errors.forEach(error =>
            console.error(`> ${error.location.file}:${error.location.line}:${error.location.column}: error: ${error.text}`)
          );
        } else {
          console.log("[watch] build finished");
        }
      },
    },
  };

const webviewConfig = {
  ...baseConfig,
  entryPoints: ["./src/webview/index.ts"],
  outfile: "./out/webview.js",
};

const scriptsConfig = {
  ...baseConfig,
  entryPoints: ["./src/providers/scripts/results.ts", "./src/providers/scripts/auth.ts"],
  outdir: "./out/scripts",
};

const testConfig = {
  ...baseConfig,
  platform: "node",
  mainFields: ["module", "main"],
  entryPoints: ["./src/test/runTest.ts", "./src/test/suite/index.ts", "./src/test/suite/extension.test.ts"],
  outdir: "./out/test",
  external: ["vscode"],
  // eslint-disable-next-line @typescript-eslint/naming-convention
  loader: { ".node": "file" },
  nodePaths: ['node_modules'],
};

(async () => {
  const args = process.argv.slice(2);
  try {
    if (args.includes("--watch")) {
      // Build and watch extension and webview code
      console.log("[watch] build started");
      await build({
        ...extensionConfig,
        ...watchConfig,
      });
      await build({
        ...webviewConfig,
        ...watchConfig,
      });
      await build({
        ...scriptsConfig,
        ...watchConfig,
      });
      await build({
        ...testConfig,
        ...watchConfig,
      });
      console.log("[watch] build finished");
    } else {
      // Build extension and webview code
      await build(extensionConfig);
      await build(webviewConfig);
      await build(scriptsConfig);
      await build(testConfig);
      console.log("build complete");
    }
  } catch (err) {
    process.stderr.write(err.stderr);
    process.exit(1);
  }
})();
