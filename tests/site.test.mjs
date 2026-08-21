import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chooseRandomIndex, normalizeSearch, poemMatches } from "../src/archive.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const poemsDirectory = path.join(root, "content", "poems");

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parsePoem(source, file) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  assert.ok(match, `${file}: thiếu frontmatter`);
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    assert.notEqual(separator, -1, `${file}: frontmatter không hợp lệ`);
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    metadata[key] = value;
  }
  return { ...metadata, slug: file.replace(/\.md$/, "") };
}

async function poemRecords() {
  const files = (await readdir(poemsDirectory)).filter((file) => file.endsWith(".md"));
  return Promise.all(files.map(async (file) => parsePoem(await readFile(path.join(poemsDirectory, file), "utf8"), file)));
}

async function page(route) {
  return readFile(path.join(output, route, "index.html"), "utf8");
}

test("tạo các trang chính và công cụ khám phá thơ", async () => {
  const [home, poems, about] = await Promise.all([page(""), page("tho"), page("gioi-thieu")]);
  assert.match(home, /<section class="featured shell"/);
  assert.match(poems, /id="poem-search"/);
  assert.match(poems, /id="year-filter"/);
  assert.match(poems, /id="random-poem"/);
  assert.match(poems, /id="archive-empty"/);
  assert.match(poems, /assets\/archive\.js/);
  assert.match(about, /<article class="about shell"/);
});

test("tạo đúng trang và metadata từ mọi file Markdown hiện có", async () => {
  const records = await poemRecords();
  const archive = await page("tho");
  assert.equal((archive.match(/data-poem-item(?:\s|>)/g) || []).length, records.length);

  for (const poem of records) {
    for (const key of ["title", "date", "excerpt"]) assert.ok(poem[key], `${poem.slug}: thiếu ${key}`);
    const html = await page(path.join("tho", poem.slug));
    const title = `${poem.title} — Nguyên Anh`;
    assert.ok(html.includes(`<title>${escapeHtml(title)}</title>`), `${poem.slug}: title không khớp`);
    assert.ok(html.includes(`<meta name="description" content="${escapeHtml(poem.excerpt)}">`), `${poem.slug}: description không khớp`);
    assert.ok(html.includes(`<meta property="og:title" content="${escapeHtml(title)}">`), `${poem.slug}: Open Graph title không khớp`);
    assert.ok(html.includes(`<meta property="og:description" content="${escapeHtml(poem.excerpt)}">`), `${poem.slug}: Open Graph description không khớp`);
    assert.ok(html.includes('<meta property="og:type" content="article">'), `${poem.slug}: thiếu loại article`);
    assert.ok(html.includes(`<meta property="article:published_time" content="${escapeHtml(poem.date)}">`), `${poem.slug}: thiếu ngày metadata`);
    assert.ok(html.includes(`<time datetime="${escapeHtml(poem.date)}">`), `${poem.slug}: thiếu ngày hiển thị`);
    assert.ok(archive.includes(`data-year="${escapeHtml(poem.date.slice(0, 4))}"`), `${poem.slug}: thiếu năm lọc`);
    assert.ok(archive.includes(escapeHtml(poem.excerpt)), `${poem.slug}: excerpt không có trong danh sách`);
  }
});

test("lọc tên không phân biệt dấu, lọc năm và chọn ngẫu nhiên an toàn", () => {
  assert.equal(normalizeSearch("  Thơ Đêm  "), "tho dem");
  assert.equal(poemMatches({ title: "Khoảng Lặng", year: "2020" }, "khoang", "2020"), true);
  assert.equal(poemMatches({ title: "Khoảng Lặng", year: "2020" }, "khác", "2020"), false);
  assert.equal(poemMatches({ title: "Khoảng Lặng", year: "2020" }, "", "2019"), false);
  assert.equal(chooseRandomIndex(0), -1);
  assert.equal(chooseRandomIndex(4, () => 0), 0);
  assert.equal(chooseRandomIndex(4, () => 0.999), 3);
});

test("mọi trang dùng theme và asset đúng base path", async () => {
  const records = await poemRecords();
  const pages = [await page("")];
  if (records[0]) pages.push(await page(path.join("tho", records[0].slug)));
  const basePath = (process.env.BASE_PATH || "").replace(/^\/+|\/+$/g, "");
  const prefix = basePath ? `/${basePath}` : "";
  for (const html of pages) {
    assert.match(html, /class="theme-toggle"/);
    assert.ok(html.includes(`href="${prefix}/assets/styles.css"`));
    assert.ok(html.includes(`src="${prefix}/assets/theme.js"`));
  }
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
