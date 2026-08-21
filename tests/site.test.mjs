import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");

async function page(route) {
  return readFile(path.join(root, "dist", route, "index.html"), "utf8");
}

test("tạo đủ các trang chính", async () => {
  const [home, poems, about] = await Promise.all([
    page(""),
    page("tho"),
    page("gioi-thieu"),
  ]);
  assert.match(home, /Có những điều/);
  assert.match(poems, /Danh sách bài thơ/);
  assert.match(about, /Mình viết để/);
});

test("tạo trang đọc cho từng bài Markdown", async () => {
  const poem = await page(path.join("tho", "mo-hien-nha-hoa-no"));
  assert.match(poem, /Mơ hiên nhà hoa nở!/);
  assert.match(poem, /Tôi đứng yên mà Trái Đất cứ quay<br>/);
  assert.match(poem, /property="og:type" content="article"/);
});

test("mọi trang đều có điều khiển giao diện", async () => {
  const poem = await page(path.join("tho", "tinh-yeu-cua-toi"));
  assert.match(poem, /class="theme-toggle"/);
  assert.match(poem, /assets\/theme\.js/);
});

async function collectHtml(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry);
    if ((await stat(fullPath)).isDirectory()) files.push(...await collectHtml(fullPath));
    else if (entry.endsWith(".html")) files.push(fullPath);
  }
  return files;
}

test("mọi liên kết nội bộ đều trỏ đến tệp đã build", async () => {
  const output = path.join(root, "dist");
  const basePath = (process.env.BASE_PATH || "").replace(/^\/+|\/+$/g, "");
  for (const file of await collectHtml(output)) {
    const html = await readFile(file, "utf8");
    const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
    for (const reference of references) {
      if (!reference.startsWith("/") || reference.startsWith("//")) continue;
      let route = reference.replace(/^\/+/, "");
      if (basePath && route.startsWith(`${basePath}/`)) route = route.slice(basePath.length + 1);
      const target = path.join(output, route);
      const existsAsFile = await stat(target).then((item) => item.isFile()).catch(() => false);
      const existsAsPage = await stat(path.join(target, "index.html")).then((item) => item.isFile()).catch(() => false);
      assert.ok(existsAsFile || existsAsPage, `${path.relative(output, file)}: không tìm thấy ${reference}`);
    }
  }
});
