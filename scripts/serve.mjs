import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const port = Number(process.env.PORT || 4173);
const types = {
  ".avif": "image/avif",
  ".css": "text/css",
  ".gif": "image/gif",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function build() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "build.mjs")], { stdio: "inherit" });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Build lỗi (${code})`)));
  });
}

await build();

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  let filePath = path.join(output, pathname.replace(/^\/+/, ""));
  if (pathname.endsWith("/")) filePath = path.join(filePath, "index.html");
  if (existsSync(filePath) && (await stat(filePath)).isDirectory()) filePath = path.join(filePath, "index.html");
  if (!existsSync(filePath)) filePath = path.join(output, "index.html");
  response.writeHead(200, { "Content-Type": `${types[path.extname(filePath)] || "application/octet-stream"}; charset=utf-8` });
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`Local: http://127.0.0.1:${port}/`));
