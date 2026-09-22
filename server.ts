import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const candidateBundles = [
  path.resolve(__dirname, "dist/server/index.mjs"),
  path.resolve(__dirname, "artifacts/api-server/dist/index.mjs"),
  path.resolve(process.cwd(), "dist/server/index.mjs"),
  path.resolve(process.cwd(), "artifacts/api-server/dist/index.mjs"),
];

const bundlePath = candidateBundles.find((p) => fs.existsSync(p));

if (bundlePath) {
  import(bundlePath).catch((err) => {
    console.error("Failed to start server bundle from", bundlePath, err);
    process.exit(1);
  });
} else {
  console.error("Could not find compiled server bundle. Checked:", candidateBundles);
  process.exit(1);
}
