import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chooseRandomIndex, normalizeSearch, poemMatches } from "../src/archive.js";
import { countFootprintsByPath, normalizeFootprints } from "../src/footprints.js";
import { PATHS, PATH_BY_SLUG, chooseNextFootstep, parseFrontmatter, renderPoemFigure } from "../scripts/content.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const poemsDirectory = path.join(root, "content", "poems");
const basePath = (process.env.BASE_PATH || "").replace(/^\/+|\/+$/g, "");
const prefix = basePath ? `/${basePath}` : "";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function poemRecords() {
  const files = (await readdir(poemsDirectory)).filter((file) => file.endsWith(".md"));
  return Promise.all(files.map(async (file) => {
    const { metadata } = parseFrontmatter(await readFile(path.join(poemsDirectory, file), "utf8"), file);
    return { ...metadata, slug: file.replace(/\.md$/, "") };
  }));
}

async function page(route) {
  return readFile(path.join(output, route, "index.html"), "utf8");
}

test("tạo các trang chính và giữ nguyên công cụ khám phá thơ", async () => {
  const [home, poems, about, paths, timeline, footprints] = await Promise.all([
    page(""),
    page("tho"),
    page("gioi-thieu"),
    page("neo"),
    page("dong-thoi-gian"),
    page("dau-chan-cua-toi"),
  ]);
  assert.match(home, /<section class="featured shell"/);
  assert.match(home, /<section class="journey-glimpse shell"/);
  assert.match(poems, /id="poem-search"/);
  assert.match(poems, /id="year-filter"/);
  assert.match(poems, /id="random-poem"/);
  assert.match(poems, /id="archive-empty"/);
  assert.match(poems, /assets\/archive\.js/);
  assert.match(about, /<article class="about shell"/);
  assert.match(paths, /<ol class="path-list">/);
  assert.match(timeline, /<section class="timeline shell"/);
  assert.match(footprints, /data-footprints-page/);
  assert.match(footprints, /assets\/footprints\.js/);
});

test("frontmatter và renderer hỗ trợ bài không ảnh, một ảnh hoặc nhiều ảnh", () => {
  const common = `title: "Bài kiểm tra"\ndate: "2026-08-26"\nexcerpt: "Kiểm tra cấu trúc."\npath: "neo-que"\nsecondary_path: "neo-tam"\nthemes:\n  - "quê hương"\n  - "ký ức"`;
  const withImage = parseFrontmatter(`---\n${common}\nimage: "/assets/poems/bai-kiem-tra/cover.jpg"\nimage_alt: "Một khoảnh khắc thật"\ngallery:\n  - "/assets/poems/bai-kiem-tra/01.jpg"\n  - "/assets/poems/bai-kiem-tra/02.jpg"\n---\nMột câu thơ`, "with-image.md");
  const withoutImage = parseFrontmatter(`---\n${common}\n---\nMột câu thơ`, "without-image.md");
  assert.deepEqual(withImage.metadata.themes, ["quê hương", "ký ức"]);
  assert.deepEqual(withImage.metadata.gallery, ["/assets/poems/bai-kiem-tra/01.jpg", "/assets/poems/bai-kiem-tra/02.jpg"]);
  assert.equal(withImage.metadata.image_alt, "Một khoảnh khắc thật");
  assert.equal(withoutImage.metadata.image, undefined);
  const imageMarkup = renderPoemFigure({
    ...withImage.metadata,
    image_dimensions: { width: 1600, height: 900 },
    gallery_dimensions: [{ width: 900, height: 1600 }, { width: 1200, height: 1200 }],
  }, { resolveUrl: (value) => `/base${value}`, escape: escapeHtml });
  assert.match(imageMarkup, /<section class="poem-images"/);
  assert.match(imageMarkup, /<div class="poem-gallery">/);
  assert.match(imageMarkup, /src="\/base\/assets\/poems\/bai-kiem-tra\/cover\.jpg"/);
  assert.match(imageMarkup, /alt="Một khoảnh khắc thật"/);
  assert.match(imageMarkup, /width="1600" height="900"/);
  assert.match(imageMarkup, /width="900" height="1600"/);
  assert.equal((imageMarkup.match(/loading="lazy"/g) || []).length, 3);
  assert.equal(renderPoemFigure(withoutImage.metadata, { resolveUrl: (value) => value, escape: escapeHtml }), "");
  assert.throws(() => parseFrontmatter(`---\n${common}\nimage: "/assets/poems/thieu-alt.jpg"\n---\nThơ`, "missing-alt.md"), /image_alt/);
  assert.throws(() => parseFrontmatter(`---\n${common}\ngallery: ["/assets/poems/01.jpg"]\n---\nThơ`, "gallery-without-cover.md"), /image chính/);
  assert.throws(() => parseFrontmatter(`---\ntitle: "Sai Nẻo"\ndate: "2026-08-26"\nexcerpt: "Sai."\npath: "neo-khong-co"\nthemes: ["thử"]\n---\nThơ`, "invalid-path.md"), /path .* không hợp lệ/);
});

test("tạo metadata, Nẻo, ảnh tùy chọn và dấu chân từ mọi file Markdown hiện có", async () => {
  const records = await poemRecords();
  const archive = await page("tho");
  assert.equal((archive.match(/data-poem-item(?:\s|>)/g) || []).length, records.length);

  for (const poem of records) {
    for (const key of ["title", "date", "excerpt"]) assert.ok(poem[key], `${poem.slug}: thiếu ${key}`);
    if (poem.path) {
      assert.ok(PATH_BY_SLUG.has(poem.path), `${poem.slug}: path không hợp lệ`);
      assert.ok(Array.isArray(poem.themes) && poem.themes.length > 0, `${poem.slug}: thiếu themes`);
    }
    if (poem.secondary_path) assert.ok(PATH_BY_SLUG.has(poem.secondary_path), `${poem.slug}: secondary_path không hợp lệ`);
    if (poem.image) assert.ok(poem.image_alt, `${poem.slug}: ảnh thiếu alt`);
    if (poem.gallery) {
      assert.ok(poem.image, `${poem.slug}: gallery thiếu ảnh chính`);
      assert.ok(poem.gallery.length > 0, `${poem.slug}: gallery rỗng`);
    }

    const html = await page(path.join("tho", poem.slug));
    const title = `${poem.title} — Nguyên Anh`;
    assert.ok(html.includes(`<title>${escapeHtml(title)}</title>`), `${poem.slug}: title không khớp`);
    assert.ok(html.includes(`<meta name="description" content="${escapeHtml(poem.excerpt)}">`), `${poem.slug}: description không khớp`);
    assert.ok(html.includes(`<meta property="og:title" content="${escapeHtml(title)}">`), `${poem.slug}: Open Graph title không khớp`);
    assert.ok(html.includes(`<meta property="og:description" content="${escapeHtml(poem.excerpt)}">`), `${poem.slug}: Open Graph description không khớp`);
    assert.ok(html.includes('<meta property="og:type" content="article">'), `${poem.slug}: thiếu loại article`);
    assert.ok(html.includes(`<meta property="article:published_time" content="${escapeHtml(poem.date)}">`), `${poem.slug}: thiếu ngày metadata`);
    assert.ok(html.includes(`data-poem-slug="${escapeHtml(poem.slug)}"`), `${poem.slug}: thiếu dữ liệu dấu chân`);
    assert.ok(html.includes(`<time datetime="${escapeHtml(poem.date)}">`), `${poem.slug}: thiếu ngày hiển thị`);
    assert.ok(archive.includes(`data-year="${escapeHtml(poem.date.slice(0, 4))}"`), `${poem.slug}: thiếu năm lọc`);
    assert.ok(archive.includes(escapeHtml(poem.excerpt)), `${poem.slug}: excerpt không có trong danh sách`);

    if (poem.path) assert.ok(html.includes(`href="${prefix}/neo/${PATH_BY_SLUG.get(poem.path).route}/"`), `${poem.slug}: thiếu link Nẻo chính`);
    if (poem.image) {
      assert.match(html, /<section class="poem-images"/);
      assert.ok(html.includes(`src="${prefix}${poem.image}"`), `${poem.slug}: sai đường dẫn ảnh`);
      const imageFile = path.join(output, poem.image.replace(/^\/+/, ""));
      assert.equal((await stat(imageFile)).isFile(), true, `${poem.slug}: ảnh chưa được copy`);
      assert.ok(html.indexOf("poem-images") > html.indexOf("poem-seal"), `${poem.slug}: ảnh phải nằm sau dấu triện`);
      assert.ok(html.indexOf("poem-images") < html.indexOf("poem-share"), `${poem.slug}: ảnh phải nằm trước chia sẻ`);
      assert.match(html, /class="poem-figure poem-figure--cover">\s*<img[^>]+ width="\d+" height="\d+"[^>]+loading="lazy"/);
      for (const galleryImage of poem.gallery || []) {
        assert.ok(html.includes(`src="${prefix}${galleryImage}"`), `${poem.slug}: thiếu ảnh gallery`);
        const galleryFile = path.join(output, galleryImage.replace(/^\/+/, ""));
        assert.equal((await stat(galleryFile)).isFile(), true, `${poem.slug}: ảnh gallery chưa được copy`);
      }
    } else {
      assert.doesNotMatch(html, /<section class="poem-images"/);
    }
  }
});

test("sáu trang Nẻo giữ đúng thứ tự, lời tựa và tự đếm bài", async () => {
  const records = await poemRecords();
  const hub = await page("neo");
  let previousPosition = -1;

  for (const poemPath of PATHS) {
    const marker = `<h2><a href="${prefix}/neo/${poemPath.route}/">${poemPath.name}</a></h2>`;
    const position = hub.indexOf(marker);
    assert.ok(position > previousPosition, `${poemPath.name}: sai thứ tự trên trang Các Nẻo`);
    previousPosition = position;
    assert.ok(hub.includes(escapeHtml(poemPath.preface)), `${poemPath.name}: thiếu lời tựa`);

    const matching = records.filter((poem) => poem.path === poemPath.slug);
    const html = await page(path.join("neo", poemPath.route));
    assert.equal((html.match(/<article class="archive-item">/g) || []).length, matching.length, `${poemPath.name}: sai số bài`);
    for (const poem of matching) assert.ok(html.includes(`href="${prefix}/tho/${poem.slug}/"`), `${poemPath.name}: thiếu ${poem.slug}`);
  }
});

test("dòng thời gian chứa mọi bài", async () => {
  const records = await poemRecords();
  const timeline = await page("dong-thoi-gian");
  assert.equal((timeline.match(/<li>\s*<time datetime=/g) || []).length, records.length);
  for (const poem of records) assert.ok(timeline.includes(`href="${prefix}/tho/${poem.slug}/"`), `timeline thiếu ${poem.slug}`);
});

test("Bước tiếp đi tuần tự trong cùng Nẻo chính và vòng từ cuối về đầu", async () => {
  const records = await poemRecords();
  const renderedNext = new Map();

  for (const poemPath of PATHS) {
    const pathPage = await page(path.join("neo", poemPath.route));
    const orderedSlugs = [...pathPage.matchAll(new RegExp(`href="${prefix}/tho/([^/]+)/"`, "g"))].map((match) => match[1]);
    const pathRecords = records.filter((poem) => poem.path === poemPath.slug);
    assert.equal(orderedSlugs.length, pathRecords.length, `${poemPath.name}: không đọc được đúng thứ tự trang Nẻo`);

    for (let index = 0; index < orderedSlugs.length; index += 1) {
      const slug = orderedSlugs[index];
      const html = await page(path.join("tho", slug));
      const match = html.match(/data-next-footstep href="([^"]+)"/);

      if (orderedSlugs.length < 2) {
        assert.equal(match, null, `${slug}: Nẻo chỉ có một bài thì không được trỏ về chính nó`);
        continue;
      }

      const expected = orderedSlugs[(index + 1) % orderedSlugs.length];
      assert.ok(match, `${slug}: thiếu Bước tiếp`);
      assert.equal(match[1], `${prefix}/tho/${expected}/`, `${slug}: Bước tiếp không theo thứ tự trang ${poemPath.name}`);
      assert.notEqual(expected, slug, `${slug}: Bước tiếp trỏ về chính nó`);
      assert.equal(records.find((poem) => poem.slug === expected)?.path, poemPath.slug, `${slug}: Bước tiếp sang sai Nẻo chính`);
      renderedNext.set(slug, expected);
    }
  }

  assert.ok(renderedNext.has("trung-thu"), "thiếu kiểm tra bài TRUNG THU");
  assert.ok(renderedNext.has("chom-thu"), "thiếu kiểm tra bài CHỚM THU");
  assert.equal(renderedNext.get("trung-thu") === "chom-thu" && renderedNext.get("chom-thu") === "trung-thu", false, "TRUNG THU và CHỚM THU vẫn tạo vòng lặp 2 bài");
});

test("hàm Bước tiếp chỉ dùng path và giữ nguyên thứ tự đầu vào", () => {
  const poems = [
    { slug: "dau", path: "neo-que", secondary_path: "neo-tinh", themes: ["giống nhau"] },
    { slug: "khac-neo", path: "neo-tinh", secondary_path: "neo-que", themes: ["giống nhau"] },
    { slug: "giua", path: "neo-que", secondary_path: "neo-tam", themes: [] },
    { slug: "cuoi", path: "neo-que", secondary_path: "neo-phieu-du", themes: ["giống nhau"] },
  ];
  assert.equal(chooseNextFootstep(poems[0], poems).candidate.slug, "giua");
  assert.equal(chooseNextFootstep(poems[2], poems).candidate.slug, "cuoi");
  assert.equal(chooseNextFootstep(poems[3], poems).candidate.slug, "dau");
  assert.equal(chooseNextFootstep(poems[1], poems), null);
});

test("Dấu chân của tôi đếm bài duy nhất theo Nẻo và không phụ thuộc nội dung mẫu", () => {
  const primary = PATHS[0].slug;
  const secondary = PATHS[1].slug;
  const entries = normalizeFootprints([
    { slug: "mot", title: "Một", path: primary, url: "/tho/mot/", visitedAt: 1 },
    { slug: "hai", title: "Hai", path: secondary, url: "/tho/hai/", visitedAt: 2 },
    { slug: "mot", title: "Một lần nữa", path: primary, url: "/tho/mot/", visitedAt: 3 },
  ]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].title, "Một lần nữa");
  assert.deepEqual(countFootprintsByPath(entries), { [primary]: 1, [secondary]: 1 });
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

test("mọi trang dùng theme và asset đúng base path GitHub Pages", async () => {
  const records = await poemRecords();
  const pages = [await page(""), await page("neo"), await page("dong-thoi-gian"), await page("dau-chan-cua-toi")];
  if (records[0]) pages.push(await page(path.join("tho", records[0].slug)));
  for (const html of pages) {
    assert.match(html, /class="theme-toggle"/);
    assert.ok(html.includes(`href="${prefix}/assets/styles.css"`));
    assert.ok(html.includes(`src="${prefix}/assets/theme.js"`));
  }

  const workflow = await readFile(path.join(root, ".github", "workflows", "deploy.yml"), "utf8");
  assert.match(workflow, /BASE_PATH:\s*\/\$\{\{ github\.event\.repository\.name \}\}/);
  assert.match(workflow, /path:\s*dist/);
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

test("mọi liên kết nội bộ quan trọng đều trỏ đến tệp đã build", async () => {
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
