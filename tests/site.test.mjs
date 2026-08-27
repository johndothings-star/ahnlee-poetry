import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chooseRandomIndex, normalizeSearch, poemMatches } from "../src/archive.js";
import { countFootprintsByPath, normalizeFootprints } from "../src/footprints.js";
import { PATHS, PATH_BY_SLUG, chooseNextFootstep, parseFrontmatter, parseGuestPoemFrontmatter, renderPoemFigure } from "../scripts/content.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const poemsDirectory = path.join(root, "content", "poems");
const guestPoemsDirectory = path.join(root, "content", "guest-poems");
const basePath = (process.env.BASE_PATH || "").replace(/^\/+|\/+$/g, "");
const prefix = basePath ? `/${basePath}` : "";
const execFileAsync = promisify(execFile);

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

async function guestPoemRecords() {
  const files = (await readdir(guestPoemsDirectory)).filter((file) => file.endsWith(".md"));
  return Promise.all(files.map(async (file) => {
    const { metadata } = parseGuestPoemFrontmatter(await readFile(path.join(guestPoemsDirectory, file), "utf8"), file);
    return { ...metadata, slug: file.replace(/\.md$/, "") };
  }));
}

async function page(route) {
  return readFile(path.join(output, route, "index.html"), "utf8");
}

test("tạo các trang chính và giữ nguyên công cụ khám phá thơ", async () => {
  const [home, poems, about, paths, timeline, footprints, guests] = await Promise.all([
    page(""),
    page("tho"),
    page("gioi-thieu"),
    page("neo"),
    page("dong-thoi-gian"),
    page("dau-chan-cua-toi"),
    page("khach-tho"),
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
  assert.match(guests, /<section class="guest-room shell"/);
  assert.match(guests, /<section class="guest-submit shell"/);
  assert.match(home, new RegExp(`href="${prefix}/khach-tho/"`));
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

test("frontmatter thơ khách độc lập với sáu Nẻo và hỗ trợ metadata tùy chọn", async () => {
  const fixture = await readFile(path.join(root, "tests", "fixtures", "guest-poem.md"), "utf8");
  const parsed = parseGuestPoemFrontmatter(fixture, "guest-poem.md");
  assert.equal(parsed.metadata.title, "Dấu chân thử");
  assert.equal(parsed.metadata.author, "Khách thử");
  assert.equal(parsed.metadata.image_alt, "Một dấu chân trên lối nhỏ");
  assert.match(parsed.body, /Một dòng thơ ghé lại/);

  const minimal = parseGuestPoemFrontmatter(`---\ntitle: "Bài không ảnh"\nauthor: "Một người ghé"\n---\nMột dòng thơ.`, "minimal.md");
  assert.equal(minimal.metadata.date, undefined);
  assert.equal(minimal.metadata.excerpt, undefined);
  assert.equal(minimal.metadata.image, undefined);
  assert.throws(() => parseGuestPoemFrontmatter(`---\ntitle: "Thiếu tên"\n---\nMột dòng thơ.`, "missing-author.md"), /author/);
  assert.throws(() => parseGuestPoemFrontmatter(`---\ntitle: "Lạc Nẻo"\nauthor: "Khách"\npath: "neo-que"\n---\nMột dòng thơ.`, "with-path.md"), /không dùng trường path/);
  assert.throws(() => parseGuestPoemFrontmatter(`---\ntitle: "Thiếu alt"\nauthor: "Khách"\nimage: "\/assets\/guest-poems\/anh.jpg"\n---\nMột dòng thơ.`, "missing-image-alt.md"), /image_alt/);
});

test("trang Dấu Chân Khách Thơ tự hiển thị danh sách hoặc trạng thái yên", async () => {
  const records = await guestPoemRecords();
  const html = await page("khach-tho");
  assert.ok(html.includes(`href="${prefix}/khach-tho/" aria-current="page"`));

  if (!records.length) {
    assert.match(html, /Phòng khách còn yên\./);
    assert.match(html, /class="guest-submit__unavailable" aria-disabled="true"/);
    assert.doesNotMatch(html, /<div class="guest-list">/);
    return;
  }

  assert.equal((html.match(/<article class="guest-item">/g) || []).length, records.length);
  assert.doesNotMatch(html, /Phòng khách còn yên\./);
  for (const poem of records) {
    assert.ok(html.includes(`href="${prefix}/khach-tho/${poem.slug}/"`), `thiếu bài khách ${poem.slug}`);
    const detail = await page(path.join("khach-tho", poem.slug));
    assert.ok(detail.includes(escapeHtml(poem.author)), `${poem.slug}: thiếu tác giả`);
    assert.doesNotMatch(detail, /nguyen-anh-seal|data-footprint-poem|poem-paths|footstep-next/);
  }
});

test("build thử bài khách có ảnh và không ảnh mà không nhập vào tuyển tập Nguyên Anh", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "ahnlee-guest-poems-"));
  const temporaryContent = path.join(temporaryRoot, "content");
  const temporaryAssets = path.join(temporaryRoot, "assets");
  const temporaryOutput = path.join(temporaryRoot, "dist");

  try {
    const fixture = await readFile(path.join(root, "tests", "fixtures", "guest-poem.md"), "utf8");
    const withoutImage = fixture
      .replace('title: "Dấu chân thử"', 'title: "Dấu chân không ảnh"')
      .replace('author: "Khách thử"', 'author: "Người ghé qua"')
      .replace(/^image:.*\r?\nimage_alt:.*\r?\n/m, "");
    await mkdir(path.join(temporaryAssets, "dau-chan-thu"), { recursive: true });
    await mkdir(temporaryContent, { recursive: true });
    await writeFile(path.join(temporaryContent, "dau-chan-thu.md"), fixture);
    await writeFile(path.join(temporaryContent, "dau-chan-khong-anh.md"), withoutImage);
    await writeFile(
      path.join(temporaryAssets, "dau-chan-thu", "cover.png"),
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    );

    await execFileAsync(process.execPath, [path.join(root, "scripts", "build.mjs")], {
      cwd: root,
      env: {
        ...process.env,
        BASE_PATH: "/ahnlee-poetry",
        BUILD_OUTPUT_DIRECTORY: temporaryOutput,
        GUEST_POEMS_DIRECTORY: temporaryContent,
        GUEST_POEM_ASSETS_DIRECTORY: temporaryAssets,
      },
      maxBuffer: 1024 * 1024,
    });

    const guestIndex = await readFile(path.join(temporaryOutput, "khach-tho", "index.html"), "utf8");
    const withImage = await readFile(path.join(temporaryOutput, "khach-tho", "dau-chan-thu", "index.html"), "utf8");
    const withoutImagePage = await readFile(path.join(temporaryOutput, "khach-tho", "dau-chan-khong-anh", "index.html"), "utf8");
    assert.equal((guestIndex.match(/<article class="guest-item">/g) || []).length, 2);
    assert.doesNotMatch(guestIndex, /Phòng khách còn yên\./);
    assert.ok(withImage.includes("<title>Dấu chân thử — Khách thử</title>"));
    assert.ok(withImage.includes('src="/ahnlee-poetry/assets/guest-poems/dau-chan-thu/cover.png"'));
    assert.ok(withImage.includes('alt="Một dấu chân trên lối nhỏ"'));
    assert.match(withImage, /width="1" height="1"/);
    assert.doesNotMatch(withImage, /nguyen-anh-seal|data-footprint-poem|poem-paths|footstep-next/);
    assert.doesNotMatch(withoutImagePage, /<section class="poem-images"/);
    assert.equal((await stat(path.join(temporaryOutput, "assets", "guest-poems", "dau-chan-thu", "cover.png"))).isFile(), true);

    for (const route of ["index.html", path.join("tho", "index.html"), path.join("neo", "index.html"), path.join("dong-thoi-gian", "index.html"), path.join("dau-chan-cua-toi", "index.html")]) {
      const mainPage = await readFile(path.join(temporaryOutput, route), "utf8");
      assert.doesNotMatch(mainPage, /khach-tho\/dau-chan-(?:thu|khong-anh)\//, `${route}: bài khách lọt vào dữ liệu Nguyên Anh`);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
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

test("Bước trước và Bước tiếp đi tuần tự trong cùng Nẻo chính", async () => {
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
      const previousMatch = html.match(/data-previous-footstep href="([^"]+)"/);
      const nextMatch = html.match(/data-next-footstep href="([^"]+)"/);

      if (orderedSlugs.length < 2) {
        assert.equal(previousMatch, null, `${slug}: Nẻo chỉ có một bài thì không được có Bước trước`);
        assert.equal(nextMatch, null, `${slug}: Nẻo chỉ có một bài thì không được có Bước tiếp`);
        continue;
      }

      const expectedPrevious = orderedSlugs[(index - 1 + orderedSlugs.length) % orderedSlugs.length];
      const expectedNext = orderedSlugs[(index + 1) % orderedSlugs.length];
      assert.ok(previousMatch, `${slug}: thiếu Bước trước`);
      assert.ok(nextMatch, `${slug}: thiếu Bước tiếp`);
      assert.equal(previousMatch[1], `${prefix}/tho/${expectedPrevious}/`, `${slug}: Bước trước không theo thứ tự trang ${poemPath.name}`);
      assert.equal(nextMatch[1], `${prefix}/tho/${expectedNext}/`, `${slug}: Bước tiếp không theo thứ tự trang ${poemPath.name}`);
      assert.notEqual(expectedPrevious, slug, `${slug}: Bước trước trỏ về chính nó`);
      assert.notEqual(expectedNext, slug, `${slug}: Bước tiếp trỏ về chính nó`);
      assert.equal(records.find((poem) => poem.slug === expectedPrevious)?.path, poemPath.slug, `${slug}: Bước trước sang sai Nẻo chính`);
      assert.equal(records.find((poem) => poem.slug === expectedNext)?.path, poemPath.slug, `${slug}: Bước tiếp sang sai Nẻo chính`);
      renderedNext.set(slug, expectedNext);
    }
  }

  assert.ok(renderedNext.has("trung-thu"), "thiếu kiểm tra bài TRUNG THU");
  assert.ok(renderedNext.has("chom-thu"), "thiếu kiểm tra bài CHỚM THU");
  assert.equal(renderedNext.get("trung-thu") === "chom-thu" && renderedNext.get("chom-thu") === "trung-thu", false, "TRUNG THU và CHỚM THU vẫn tạo vòng lặp 2 bài");
});

test("hàm Bước trước/Bước tiếp chỉ dùng path và giữ nguyên thứ tự đầu vào", () => {
  const poems = [
    { slug: "dau", path: "neo-que", secondary_path: "neo-tinh", themes: ["giống nhau"] },
    { slug: "khac-neo", path: "neo-tinh", secondary_path: "neo-que", themes: ["giống nhau"] },
    { slug: "giua", path: "neo-que", secondary_path: "neo-tam", themes: [] },
    { slug: "cuoi", path: "neo-que", secondary_path: "neo-phieu-du", themes: ["giống nhau"] },
  ];
  assert.deepEqual(
    [chooseNextFootstep(poems[0], poems).previous.slug, chooseNextFootstep(poems[0], poems).candidate.slug],
    ["cuoi", "giua"],
  );
  assert.deepEqual(
    [chooseNextFootstep(poems[2], poems).previous.slug, chooseNextFootstep(poems[2], poems).candidate.slug],
    ["dau", "cuoi"],
  );
  assert.deepEqual(
    [chooseNextFootstep(poems[3], poems).previous.slug, chooseNextFootstep(poems[3], poems).candidate.slug],
    ["giua", "dau"],
  );
  assert.equal(chooseNextFootstep(poems[1], poems), null);
});

test("Dấu chân còn có chỉ dẫn tới Nẻo phụ của chính bài", async () => {
  const records = await poemRecords();
  let withSecondaryPath = 0;
  let withoutSecondaryPath = 0;

  for (const poem of records) {
    const html = await page(path.join("tho", poem.slug));
    const crossroad = html.match(/<a class="footstep-crossroad" href="([^"]+)">([^<]+)<span aria-hidden="true">→<\/span><\/a>/);
    if (!poem.secondary_path) {
      withoutSecondaryPath += 1;
      assert.equal(crossroad, null, `${poem.slug}: không có secondary_path nhưng vẫn hiện Dấu chân còn có`);
      continue;
    }

    withSecondaryPath += 1;
    const secondaryPath = PATH_BY_SLUG.get(poem.secondary_path);
    assert.ok(crossroad, `${poem.slug}: thiếu Dấu chân còn có`);
    assert.equal(crossroad[1], `${prefix}/neo/${secondaryPath.route}/`, `${poem.slug}: Dấu chân còn có không trỏ tới trang Nẻo phụ`);
    assert.equal(crossroad[2].trim(), `Dấu chân còn có: ${secondaryPath.name}`, `${poem.slug}: sai tên Nẻo phụ`);
  }

  assert.ok(withSecondaryPath > 0, "thiếu bài có secondary_path để kiểm tra");
  assert.ok(withoutSecondaryPath > 0, "thiếu bài không có secondary_path để kiểm tra");
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
  const guestRecords = await guestPoemRecords();
  const pages = [await page(""), await page("neo"), await page("dong-thoi-gian"), await page("dau-chan-cua-toi"), await page("khach-tho")];
  if (records[0]) pages.push(await page(path.join("tho", records[0].slug)));
  if (guestRecords[0]) pages.push(await page(path.join("khach-tho", guestRecords[0].slug)));
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
