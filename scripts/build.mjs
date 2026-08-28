import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PATHS, PATH_BY_SLUG, chooseNextFootstep, parseFrontmatter, parseGuestPoemFrontmatter, poemSocialDescription, renderPoemFigure } from "./content.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(process.env.BUILD_OUTPUT_DIRECTORY || path.join(root, "dist"));
const poemsDirectory = path.join(root, "content", "poems");
const poemAssetsDirectory = path.join(root, "src", "assets", "poems");
const guestPoemsDirectory = path.resolve(process.env.GUEST_POEMS_DIRECTORY || path.join(root, "content", "guest-poems"));
const guestPoemAssetsDirectory = path.resolve(process.env.GUEST_POEM_ASSETS_DIRECTORY || path.join(root, "src", "assets", "guest-poems"));
const guestPoemsConfigPath = path.resolve(process.env.GUEST_POEMS_CONFIG_PATH || path.join(root, "content", "guest-poems.config.json"));
const basePath = normalizeBasePath(process.env.BASE_PATH || "");
const siteOrigin = "https://johndothings-star.github.io";

function normalizeBasePath(value) {
  if (!value || value === "/") return "";
  return `/${value.replace(/^\/+|\/+$/g, "")}`;
}

function url(route = "/") {
  const cleanRoute = route === "/" ? "/" : `/${route.replace(/^\/+/, "")}`;
  return `${basePath}${cleanRoute}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function pathExists(target) {
  return access(target).then(() => true).catch(() => false);
}

function jpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) break;
    offset += length + 2;
  }
  return null;
}

function imageDimensions(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  return jpegDimensions(buffer);
}

async function validatePoemImage(imageValue, fileName, fieldName) {
  const image = imageValue.replaceAll("\\", "/");
  const prefix = "/assets/poems/";
  if (!image.startsWith(prefix)) {
    throw new Error(`${fileName}: ${fieldName} phải nằm trong ${prefix}.`);
  }

  const relativeImage = image.slice(prefix.length);
  const source = path.resolve(poemAssetsDirectory, relativeImage);
  const safeRoot = `${path.resolve(poemAssetsDirectory)}${path.sep}`;
  if (!source.startsWith(safeRoot) || !await pathExists(source)) {
    throw new Error(`${fileName}: không tìm thấy ảnh ${image}.`);
  }
  return imageDimensions(await readFile(source));
}

async function validatePoemImages(metadata, fileName) {
  if (!metadata.image) return {};
  const imageDimensions = await validatePoemImage(metadata.image, fileName, "image");
  const galleryDimensions = await Promise.all((metadata.gallery || []).map((image) => validatePoemImage(image, fileName, "gallery")));
  return { image_dimensions: imageDimensions, gallery_dimensions: galleryDimensions };
}

async function validateGuestPoemImage(imageValue, fileName) {
  if (!imageValue) return null;
  const image = imageValue.replaceAll("\\", "/");
  const prefix = "/assets/guest-poems/";
  if (!image.startsWith(prefix)) {
    throw new Error(`${fileName}: image thơ khách phải nằm trong ${prefix}.`);
  }

  const relativeImage = image.slice(prefix.length);
  const source = path.resolve(guestPoemAssetsDirectory, relativeImage);
  const safeRoot = `${path.resolve(guestPoemAssetsDirectory)}${path.sep}`;
  if (!source.startsWith(safeRoot) || !await pathExists(source)) {
    throw new Error(`${fileName}: không tìm thấy ảnh ${image}.`);
  }
  return imageDimensions(await readFile(source));
}

async function readPoems() {
  const files = (await readdir(poemsDirectory)).filter((file) => file.endsWith(".md"));
  const poems = await Promise.all(files.map(async (file) => {
    const source = await readFile(path.join(poemsDirectory, file), "utf8");
    const { metadata, body } = parseFrontmatter(source, file);
    const imageMetadata = await validatePoemImages(metadata, file);
    return {
      ...metadata,
      ...imageMetadata,
      body,
      slug: file.replace(/\.md$/, ""),
      featured: metadata.featured === "true",
      themes: metadata.themes || [],
    };
  }));
  return poems.sort((a, b) => b.date.localeCompare(a.date));
}

async function readGuestPoems() {
  if (!await pathExists(guestPoemsDirectory)) return [];
  const files = (await readdir(guestPoemsDirectory)).filter((file) => file.endsWith(".md"));
  const poems = await Promise.all(files.map(async (file) => {
    const source = await readFile(path.join(guestPoemsDirectory, file), "utf8");
    const { metadata, body } = parseGuestPoemFrontmatter(source, file);
    return {
      ...metadata,
      body,
      slug: file.replace(/\.md$/, ""),
      image_dimensions: await validateGuestPoemImage(metadata.image, file),
    };
  }));
  return poems.sort((first, second) =>
    (second.date || "").localeCompare(first.date || "") || first.title.localeCompare(second.title, "vi"));
}

async function readGuestPoemsConfig() {
  if (!await pathExists(guestPoemsConfigPath)) return { guestSubmissionUrl: "" };
  const config = JSON.parse(await readFile(guestPoemsConfigPath, "utf8"));
  const guestSubmissionUrl = typeof config.guestSubmissionUrl === "string" ? config.guestSubmissionUrl.trim() : "";
  if (!guestSubmissionUrl) return { guestSubmissionUrl: "" };
  let target;
  try {
    target = new URL(guestSubmissionUrl);
  } catch {
    throw new Error("guest-poems.config.json: guestSubmissionUrl không phải URL Google Form hợp lệ.");
  }
  const isGoogleForm = target.protocol === "https:"
    && (target.hostname === "forms.gle" || (target.hostname === "docs.google.com" && target.pathname.startsWith("/forms/")));
  if (!isGoogleForm) {
    throw new Error("guest-poems.config.json: guestSubmissionUrl phải là URL Google Form dùng https.");
  }
  return { guestSubmissionUrl };
}

function formatDate(date) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function pathUrl(pathSlug) {
  const poemPath = PATH_BY_SLUG.get(pathSlug);
  return poemPath ? url(`/neo/${poemPath.route}/`) : url("/neo/");
}

function poemPathLinks(poem) {
  const primary = PATH_BY_SLUG.get(poem.path);
  const secondary = PATH_BY_SLUG.get(poem.secondary_path);
  if (!primary) return "";
  return `<p class="poem-paths"><a href="${pathUrl(primary.slug)}">${escapeHtml(primary.name)}</a>${secondary ? `<span>giao với</span><a href="${pathUrl(secondary.slug)}">${escapeHtml(secondary.name)}</a>` : ""}</p>`;
}

function archiveItem(poem, index, { showSecondaryPath = false } = {}) {
  const secondary = PATH_BY_SLUG.get(poem.secondary_path);
  return `<article class="archive-item">
    <span class="archive-item__number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
    <div>
      <h2><a href="${url(`/tho/${poem.slug}/`)}">${escapeHtml(poem.title)}</a></h2>
      <p>${escapeHtml(poem.excerpt)}</p>
      ${showSecondaryPath && secondary ? `<p class="archive-item__cross">Giao với <a href="${pathUrl(secondary.slug)}">${escapeHtml(secondary.name)}</a></p>` : ""}
    </div>
    <time datetime="${escapeHtml(poem.date)}">${escapeHtml(formatDate(poem.date))}</time>
  </article>`;
}

function poemCard(poem) {
  return `<article class="poem-card">
    <time class="poem-card__date" datetime="${escapeHtml(poem.date)}">${escapeHtml(formatDate(poem.date))}</time>
    <h3><a href="${url(`/tho/${poem.slug}/`)}">${escapeHtml(poem.title)}</a></h3>
    <p>${escapeHtml(poem.excerpt)}</p>
    <a class="text-link" href="${url(`/tho/${poem.slug}/`)}" aria-label="Đọc bài ${escapeHtml(poem.title)}">Đọc bài thơ <span aria-hidden="true">→</span></a>
  </article>`;
}

function guestPoemItem(poem) {
  return `<article class="guest-item">
    <div class="guest-item__meta">
      <span>${escapeHtml(poem.author)}</span>
      ${poem.date ? `<time datetime="${escapeHtml(poem.date)}">${escapeHtml(formatDate(poem.date))}</time>` : ""}
    </div>
    <h2><a href="${url(`/khach-tho/${poem.slug}/`)}">${escapeHtml(poem.title)}</a></h2>
    ${poem.excerpt ? `<p>${escapeHtml(poem.excerpt)}</p>` : ""}
  </article>`;
}

function renderGuestNote(label, value) {
  if (!value) return "";
  return `<p><span>${label}</span>${escapeHtml(value).replaceAll("\n", "<br>")}</p>`;
}

function layout({
  title,
  description,
  documentTitle = "",
  active = "",
  type = "website",
  publishedTime = "",
  canonicalPath = "",
  socialImagePath = "/assets/og-preview.png",
  socialImageAlt = "Nguyên Anh — Thơ, và những khoảng lặng.",
  socialImageWidth = 1200,
  socialImageHeight = 630,
  scripts = [],
  content,
}) {
  const pageTitle = documentTitle || (title === "Nguyên Anh" ? "Nguyên Anh — Thơ" : `${title} — Nguyên Anh`);
  const socialImage = socialImagePath ? `${siteOrigin}${url(socialImagePath)}` : "";
  const canonicalUrl = canonicalPath ? `${siteOrigin}${url(canonicalPath)}` : "";
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="color-scheme" content="light dark">
  <meta property="og:locale" content="vi_VN">
  <meta property="og:site_name" content="Nguyên Anh — Thơ">
  <meta property="og:type" content="${type}">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  ${canonicalUrl ? `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">` : ""}
  ${socialImage ? `<meta property="og:image" content="${escapeHtml(socialImage)}">
  ${socialImageWidth ? `<meta property="og:image:width" content="${socialImageWidth}">` : ""}
  ${socialImageHeight ? `<meta property="og:image:height" content="${socialImageHeight}">` : ""}
  <meta property="og:image:alt" content="${escapeHtml(socialImageAlt)}">` : ""}
  ${publishedTime ? `<meta property="article:published_time" content="${escapeHtml(publishedTime)}">` : ""}
  <meta name="twitter:card" content="${socialImage ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  ${socialImage ? `<meta name="twitter:image" content="${escapeHtml(socialImage)}">
  <meta name="twitter:image:alt" content="${escapeHtml(socialImageAlt)}">` : ""}
  <title>${escapeHtml(pageTitle)}</title>
  ${canonicalUrl ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">` : ""}
  <script>try{const t=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}</script>
  <link rel="icon" type="image/png" sizes="64x64" href="${url("/assets/favicon.png")}">
  <link rel="stylesheet" href="${url("/assets/styles.css")}">
  <script src="${url("/assets/theme.js")}" defer></script>
  ${scripts.map((script) => `<script type="module" src="${url(script)}"></script>`).join("\n  ")}
</head>
<body>
  <a class="skip-link" href="#noi-dung">Đi đến nội dung</a>
  <header class="site-header">
    <div class="shell header-inner">
      <a class="wordmark" href="${url("/")}" aria-label="Nguyên Anh — Trang chủ">Nguyên Anh<span>.</span></a>
      <nav aria-label="Điều hướng chính">
        <a href="${url("/")}"${active === "home" ? ' aria-current="page"' : ""}>Trang chủ</a>
        <a href="${url("/tho/")}"${active === "poems" ? ' aria-current="page"' : ""}>Thơ</a>
        <a href="${url("/neo/")}"${active === "journey" ? ' aria-current="page"' : ""}>Các Nẻo</a>
        <a href="${url("/khach-tho/")}"${active === "guests" ? ' aria-current="page"' : ""}>Khách thơ</a>
        <a href="${url("/gioi-thieu/")}"${active === "about" ? ' aria-current="page"' : ""}>Giới thiệu</a>
      </nav>
      <button class="theme-toggle" type="button" aria-label="Chuyển giao diện sáng hoặc tối">
        <span class="theme-toggle__sun" aria-hidden="true">☼</span>
        <span class="theme-toggle__moon" aria-hidden="true">☾</span>
      </button>
    </div>
  </header>
  <main id="noi-dung">${content}</main>
  <footer class="site-footer">
    <div class="shell"><span>Nguyên Anh</span><span>Thơ, và những khoảng lặng.</span></div>
  </footer>
</body>
</html>`;
}

async function writePage(route, html) {
  const directory = route === "/" ? output : path.join(output, route.replace(/^\/+|\/+$/g, ""));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), html);
}

function renderPoemBody(body) {
  return body
    .split(/\r?\n\s*\r?\n/)
    .map((stanza) => `<p>${stanza.split(/\r?\n/).map(escapeHtml).join("<br>")}</p>`)
    .join("");
}

async function build() {
  await rm(output, { recursive: true, force: true });
  await mkdir(path.join(output, "assets"), { recursive: true });
  await cp(path.join(root, "src", "styles.css"), path.join(output, "assets", "styles.css"));
  await cp(path.join(root, "src", "theme.js"), path.join(output, "assets", "theme.js"));
  await cp(path.join(root, "src", "archive.js"), path.join(output, "assets", "archive.js"));
  await cp(path.join(root, "src", "poem.js"), path.join(output, "assets", "poem.js"));
  await cp(path.join(root, "src", "footprints.js"), path.join(output, "assets", "footprints.js"));
  await cp(path.join(root, "src", "assets", "nguyen-anh-seal.png"), path.join(output, "assets", "nguyen-anh-seal.png"));
  await cp(path.join(root, "src", "assets", "favicon.png"), path.join(output, "assets", "favicon.png"));
  await cp(path.join(root, "src", "assets", "og-preview.png"), path.join(output, "assets", "og-preview.png"));
  if (await pathExists(poemAssetsDirectory)) {
    await cp(poemAssetsDirectory, path.join(output, "assets", "poems"), { recursive: true });
  }
  if (await pathExists(guestPoemAssetsDirectory)) {
    await cp(guestPoemAssetsDirectory, path.join(output, "assets", "guest-poems"), { recursive: true });
  }

  const poems = await readPoems();
  const guestPoems = await readGuestPoems();
  const guestPoemsConfig = await readGuestPoemsConfig();
  const poemCount = poems.length;
  const featured = poems.filter((poem) => poem.featured).slice(0, 3);
  const selected = featured.length ? featured : poems.slice(0, 3);
  const years = [...new Set(poems.map((poem) => poem.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  const poemUrls = poems.map((poem) => url(`/tho/${poem.slug}/`));

  const home = layout({
    title: "Nguyên Anh",
    description: "Những bài thơ về ký ức, thiên nhiên và những khoảng lặng trong đời sống.",
    active: "home",
    canonicalPath: "/",
    scripts: ["/assets/archive.js"],
    content: `<section class="hero shell">
      <p class="eyebrow">Một góc nhỏ dành cho thơ</p>
      <h1>Có những điều<br>chỉ thơ mới <em>nói được.</em></h1>
      <p class="hero__intro">Tôi đi nhặt chữ gieo vần,<br>qua muôn ngàn chốn cũng gần thành thơ.</p>
      <a class="primary-link" href="${url("/tho/")}">Đọc tất cả bài thơ <span aria-hidden="true">→</span></a>
      <p class="hero__surprise">Hôm ni đọc chi? <a class="surprise-link" href="${poemUrls[0] || url("/tho/")}" data-random-poem-link data-poem-urls="${escapeHtml(JSON.stringify(poemUrls))}">Một bài bất chợt <span aria-hidden="true">→</span></a></p>
    </section>
    <section class="featured shell" aria-labelledby="poems-heading">
      <div class="section-heading">
        <div><p class="eyebrow">Thơ chọn đọc</p><h2 id="poems-heading">Một vài bài thơ</h2></div>
        <a class="text-link desktop-link" href="${url("/tho/")}">Xem tất cả <span aria-hidden="true">→</span></a>
      </div>
      <div class="poem-grid">${selected.map(poemCard).join("")}</div>
    </section>
    <section class="journey-glimpse shell" aria-labelledby="journey-glimpse-heading">
      <p class="eyebrow">Sáu Nẻo</p>
      <h2 id="journey-glimpse-heading">Quê · Tình · Phiêu Du · Đời · Thanh Nhàn · Tâm</h2>
      <a class="text-link" href="${url("/neo/")}">Bước vào các Nẻo <span aria-hidden="true">→</span></a>
    </section>`,
  });

  await writePage("/", home);

  const poemsPage = layout({
    title: "Thơ",
    description: "Tất cả bài thơ của Nguyên Anh, sắp xếp từ mới nhất.",
    active: "poems",
    canonicalPath: "/tho/",
    scripts: ["/assets/archive.js"],
    content: `<header class="page-heading shell">
      <p class="eyebrow">TUYỂN TẬP THƠ</p>
      <h1>CHÂN TRẦN<br class="page-heading__mobile-break"> <span class="page-heading__keep">MUÔN NẺO</span></h1>
      <p>Chân trần đi qua muôn nẻo, những điều đã gặp, đã thấy, đã thương và đã ngẫm được giữ lại thành thơ, để cùng người đọc ngẫm thêm.</p>
    </header>
    <section class="archive shell" aria-label="Danh sách bài thơ">
      <div class="archive-tools">
        <label class="archive-field archive-field--search" for="poem-search">
          <span>Tìm theo tên</span>
          <input id="poem-search" type="search" placeholder="Nhập tên bài thơ…" autocomplete="off" aria-controls="poem-list">
        </label>
        <label class="archive-field" for="year-filter">
          <span>Năm sáng tác</span>
          <select id="year-filter" aria-controls="poem-list">
            <option value="">Tất cả các năm</option>
            ${years.map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`).join("")}
          </select>
        </label>
        <button class="random-poem" id="random-poem" type="button"${poemCount ? "" : " disabled"}>Một bài ngẫu nhiên <span aria-hidden="true">→</span></button>
      </div>
      <p class="archive-summary" id="archive-summary" aria-live="polite">${poemCount} bài thơ</p>
      <div class="archive-list" id="poem-list">
        ${poems.map((poem, index) => `<article class="archive-item" data-poem-item data-title="${escapeHtml(poem.title)}" data-year="${escapeHtml(poem.date.slice(0, 4))}" data-url="${url(`/tho/${poem.slug}/`)}">
          <span class="archive-item__number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
          <div>
            <h2><a href="${url(`/tho/${poem.slug}/`)}">${escapeHtml(poem.title)}</a></h2>
            <p>${escapeHtml(poem.excerpt)}</p>
          </div>
          <time datetime="${escapeHtml(poem.date)}">${escapeHtml(formatDate(poem.date))}</time>
        </article>`).join("")}
      </div>
      <p class="archive-empty" id="archive-empty"${poemCount ? " hidden" : ""}>Không tìm thấy bài thơ phù hợp. Thử một từ khóa khác hoặc xem tất cả các năm nhé.</p>
    </section>`,
  });
  await writePage("/tho/", poemsPage);

  const submissionAction = guestPoemsConfig.guestSubmissionUrl
    ? `<a class="primary-link" href="${escapeHtml(guestPoemsConfig.guestSubmissionUrl)}" target="_blank" rel="noopener noreferrer">Gửi một dấu chân thơ <span aria-hidden="true">→</span></a>`
    : `<span class="guest-submit__unavailable" aria-disabled="true">Gửi một dấu chân thơ <span aria-hidden="true">→</span></span>
      <p class="guest-submit__status">Kênh gửi thơ đang được chuẩn bị.</p>`;
  const guestPoemsPage = layout({
    title: "Dấu Chân Khách Thơ",
    description: "Nơi khách ghé Chân Trần, để lại đôi vần thơ và một dấu chân riêng.",
    active: "guests",
    canonicalPath: "/khach-tho/",
    content: `<header class="page-heading guest-heading shell">
      <p class="eyebrow">Phòng khách thơ</p>
      <h1>Dấu Chân Khách Thơ</h1>
      <p>Nơi khách ghé Chân Trần, để lại đôi vần thơ và một dấu chân riêng.</p>
    </header>
    <section class="guest-room shell" aria-label="Những bài thơ của khách">
      <p class="guest-room__intro">Chân Trần Muôn Nẻo là ngôi nhà ký ức thơ Chân Trần - Nguyên Anh. Dấu Chân Khách Thơ là một góc nhỏ dành cho bạn hữu ghé qua, để lại một bài thơ, một chút lòng và một dấu chân riêng.</p>
      ${guestPoems.length
        ? `<div class="guest-list">${guestPoems.map(guestPoemItem).join("")}</div>`
        : `<p class="guest-empty">Phòng khách còn yên.<br>Khi có một dấu chân thơ ghé lại, nơi này sẽ bắt đầu có chuyện để kể.</p>`}
    </section>
    <section class="guest-submit shell" aria-labelledby="guest-submit-heading">
      <p class="eyebrow">Ghé lại đôi vần</p>
      <h2 id="guest-submit-heading">Gửi một dấu chân thơ</h2>
      <p>Nếu có một bài thơ muốn gửi lại phòng khách, bạn có thể gửi để chủ nhà đọc và chọn đăng.</p>
      <div class="guest-submit__action">${submissionAction}</div>
      <ul>
        <li>Bài thơ là tác phẩm bạn có quyền gửi, kèm tên hoặc bút danh rõ ràng.</li>
        <li>Gửi bài không đồng nghĩa với việc bài sẽ tự động được đăng; chủ nhà sẽ chọn những bài phù hợp.</li>
        <li>Thơ của bạn được giữ nguyên theo bản gửi, trừ khi tác giả có yêu cầu chỉnh sửa.</li>
      </ul>
    </section>`,
  });
  await writePage("/khach-tho/", guestPoemsPage);

  for (const poem of guestPoems) {
    const description = poem.excerpt || `Bài thơ “${poem.title}” của ${poem.author} tại Dấu Chân Khách Thơ.`;
    const notes = [
      renderGuestNote("Đôi lời tác giả", poem.author_note),
      renderGuestNote("Ghi chú nguồn", poem.source_note),
    ].filter(Boolean).join("");
    const guestPoemPage = layout({
      title: poem.title,
      documentTitle: `${poem.title} — ${poem.author}`,
      description,
      active: "guests",
      type: "article",
      publishedTime: poem.date || "",
      canonicalPath: `/khach-tho/${poem.slug}/`,
      content: `<article class="poem-reader guest-poem-reader shell">
        <header class="poem-reader__header">
          <a class="back-link" href="${url("/khach-tho/")}"><span aria-hidden="true">←</span> Dấu Chân Khách Thơ</a>
          <h1>${escapeHtml(poem.title)}</h1>
          <p class="guest-poem-byline"><span>Tác giả</span><strong>${escapeHtml(poem.author)}</strong>${poem.date ? `<span aria-hidden="true">·</span><time datetime="${escapeHtml(poem.date)}">${escapeHtml(formatDate(poem.date))}</time>` : ""}</p>
        </header>
        <div class="poem-body">${renderPoemBody(poem.body)}</div>
        ${renderPoemFigure(poem, { resolveUrl: url, escape: escapeHtml })}
        ${notes ? `<aside class="guest-poem-notes" aria-label="Ghi chú về bài thơ">${notes}</aside>` : ""}
        <footer class="guest-poem-return"><a class="text-link" href="${url("/khach-tho/")}"><span aria-hidden="true">←</span> Trở lại phòng khách thơ</a></footer>
      </article>`,
    });
    await writePage(`/khach-tho/${poem.slug}/`, guestPoemPage);
  }

  const poemsByPath = new Map(PATHS.map((poemPath) => [poemPath.slug, poems.filter((poem) => poem.path === poemPath.slug)]));
  const pathsPage = layout({
    title: "Các Nẻo",
    description: "Sáu Nẻo Quê, Tình, Phiêu Du, Đời, Thanh Nhàn và Tâm trong thơ Nguyên Anh.",
    active: "journey",
    canonicalPath: "/neo/",
    content: `<header class="page-heading journey-heading shell">
      <p class="eyebrow">Chân trần muôn nẻo</p>
      <h1>Các Nẻo</h1>
      <p>Quê, Tình, Phiêu Du, Đời, Thanh Nhàn và Tâm không phải sáu chặng thẳng. Mỗi Nẻo có thể trở lại ở một tầng trải nghiệm khác.</p>
    </header>
    <section class="paths shell" aria-label="Sáu Nẻo thơ">
      <ol class="path-list">
        ${PATHS.map((poemPath, index) => `<li>
          <span class="path-list__number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
          <div>
            <h2><a href="${pathUrl(poemPath.slug)}">${escapeHtml(poemPath.name)}</a></h2>
            <p>${escapeHtml(poemPath.preface)}</p>
            <a class="path-list__count" href="${pathUrl(poemPath.slug)}">${poemsByPath.get(poemPath.slug).length} bài thơ <span aria-hidden="true">→</span></a>
          </div>
        </li>`).join("")}
      </ol>
      <nav class="journey-links" aria-label="Những cách đi khác">
        <a href="${url("/dong-thoi-gian/")}">Dòng thời gian <span aria-hidden="true">→</span></a>
        <a href="${url("/dau-chan-cua-toi/")}">Dấu chân của tôi <span aria-hidden="true">→</span></a>
      </nav>
    </section>`,
  });
  await writePage("/neo/", pathsPage);

  for (const poemPath of PATHS) {
    const pathPoems = poemsByPath.get(poemPath.slug);
    const pathPage = layout({
      title: poemPath.name,
      description: poemPath.preface,
      active: "journey",
      canonicalPath: `/neo/${poemPath.route}/`,
      content: `<header class="page-heading path-heading shell">
        <a class="back-link" href="${url("/neo/")}"><span aria-hidden="true">←</span> Các Nẻo</a>
        <p class="eyebrow">Chân trần muôn nẻo</p>
        <h1>${escapeHtml(poemPath.name)}</h1>
        <p>${escapeHtml(poemPath.preface)}</p>
      </header>
      <section class="archive path-archive shell" aria-label="Các bài thuộc ${escapeHtml(poemPath.name)}">
        <p class="archive-summary">${pathPoems.length} bài thơ</p>
        <div class="archive-list">${pathPoems.map((poem, index) => archiveItem(poem, index, { showSecondaryPath: true })).join("")}</div>
      </section>`,
    });
    await writePage(`/neo/${poemPath.route}/`, pathPage);
  }

  const poemsByYear = new Map(years.map((year) => [year, poems.filter((poem) => poem.date.startsWith(year))]));
  const timelinePage = layout({
    title: "Dòng thời gian",
    description: "Dòng thời gian sáng tác, nơi sáu Nẻo trở lại qua nhiều năm thơ Nguyên Anh.",
    active: "journey",
    canonicalPath: "/dong-thoi-gian/",
    content: `<header class="page-heading timeline-heading shell">
      <p class="eyebrow">Những năm đã đi qua</p>
      <h1>Dòng thời gian</h1>
      <p>Sáu Nẻo cứ xuất hiện, lùi xa rồi trở lại qua nhiều năm sáng tác — một hành trình không đi theo đường thẳng.</p>
    </header>
    <section class="timeline shell" aria-label="Các bài thơ theo năm">
      ${years.map((year) => `<section class="timeline-year" aria-labelledby="year-${year}">
        <header><h2 id="year-${year}">${year}</h2><span>${poemsByYear.get(year).length} bài</span></header>
        <ol class="timeline-list">
          ${poemsByYear.get(year).map((poem) => {
            const poemPath = PATH_BY_SLUG.get(poem.path);
            return `<li>
              <time datetime="${escapeHtml(poem.date)}">${escapeHtml(formatDate(poem.date))}</time>
              <h3><a href="${url(`/tho/${poem.slug}/`)}">${escapeHtml(poem.title)}</a></h3>
              ${poemPath ? `<a class="path-mark" href="${pathUrl(poemPath.slug)}">${escapeHtml(poemPath.name)}</a>` : `<span class="path-mark">Chưa phân Nẻo</span>`}
            </li>`;
          }).join("")}
        </ol>
      </section>`).join("")}
    </section>`,
  });
  await writePage("/dong-thoi-gian/", timelinePage);

  const footprintsPage = layout({
    title: "Dấu chân của tôi",
    description: "Một tấm bản đồ nhỏ về những Nẻo và bài thơ người đọc đã đi qua.",
    active: "journey",
    canonicalPath: "/dau-chan-cua-toi/",
    scripts: ["/assets/footprints.js"],
    content: `<header class="page-heading footprints-heading shell">
      <p class="eyebrow">Một tấm bản đồ nhỏ</p>
      <h1>Dấu chân của tôi</h1>
      <p>Đây không phải thành tích. Chỉ là một cách nhìn lại những Nẻo và bài thơ mình đã đi qua trên trình duyệt này.</p>
    </header>
    <section class="footprints shell" data-footprints-page>
      <ol class="footprint-summary" aria-label="Số dấu chân theo Nẻo">
        ${PATHS.map((poemPath) => `<li data-footprint-summary="${poemPath.slug}"><a href="${pathUrl(poemPath.slug)}"><span>${escapeHtml(poemPath.name)}</span><strong data-footprint-count>0 dấu chân</strong></a></li>`).join("")}
      </ol>
      <div class="footprint-history">
        <div class="footprint-history__heading">
          <h2>Những bài đã đi qua</h2>
          <button type="button" data-clear-footprints disabled>Xóa lịch sử</button>
        </div>
        <p class="footprints-empty" data-footprints-empty aria-live="polite">Chưa có dấu chân nào. Mỗi bài thơ bạn mở sẽ để lại một dấu nhỏ ở đây.</p>
        <ol class="footprint-list" data-footprint-list aria-live="polite"></ol>
      </div>
      <noscript>Trình duyệt cần bật JavaScript để lưu dấu chân ngay trên thiết bị này.</noscript>
    </section>`,
  });
  await writePage("/dau-chan-cua-toi/", footprintsPage);

  for (const poem of poems) {
    const footsteps = chooseNextFootstep(poem, poems);
    const previousPoem = footsteps?.previous;
    const nextPoem = footsteps?.candidate;
    const secondaryPath = PATH_BY_SLUG.get(poem.secondary_path);
    const description = poemSocialDescription(poem);
    const footstepNavigation = previousPoem && nextPoem ? `<nav class="footstep-next" aria-label="Bước trước và Bước tiếp trong Nẻo chính">
          <a class="footstep-next__item" data-previous-footstep href="${url(`/tho/${previousPoem.slug}/`)}">
            <span class="footstep-next__label"><span aria-hidden="true">←</span> Bước trước</span>
            <span class="footstep-next__title">${escapeHtml(previousPoem.title)}</span>
          </a>
          <a class="footstep-next__item footstep-next__item--next" data-next-footstep href="${url(`/tho/${nextPoem.slug}/`)}">
            <span class="footstep-next__label">Bước tiếp <span aria-hidden="true">→</span></span>
            <span class="footstep-next__title">${escapeHtml(nextPoem.title)}</span>
          </a>
        </nav>` : "";
    const secondaryNavigation = secondaryPath ? `<a class="footstep-crossroad" href="${pathUrl(secondaryPath.slug)}">Dấu chân còn có: ${escapeHtml(secondaryPath.name)} <span aria-hidden="true">→</span></a>` : "";
    const poemPage = layout({
      title: poem.title,
      description,
      active: "poems",
      type: "article",
      publishedTime: poem.date,
      canonicalPath: `/tho/${poem.slug}/`,
      socialImagePath: poem.image || "/assets/og-preview.png",
      socialImageAlt: poem.image ? poem.image_alt : "Nguyên Anh — Thơ, và những khoảng lặng.",
      socialImageWidth: poem.image ? (poem.image_dimensions?.width || null) : 1200,
      socialImageHeight: poem.image ? (poem.image_dimensions?.height || null) : 630,
      scripts: ["/assets/poem.js", "/assets/footprints.js"],
      content: `<article class="poem-reader shell" data-footprint-poem data-poem-slug="${escapeHtml(poem.slug)}" data-poem-path="${escapeHtml(poem.path || "")}" data-poem-title="${escapeHtml(poem.title)}" data-poem-url="${url(`/tho/${poem.slug}/`)}" data-poem-date="${escapeHtml(poem.date)}">
        <header class="poem-reader__header">
          <a class="back-link" href="${url("/tho/")}"><span aria-hidden="true">←</span> Tất cả bài thơ</a>
          <h1>${escapeHtml(poem.title)}</h1>
          <p class="poem-date"><span>Sáng tác</span><time datetime="${escapeHtml(poem.date)}">${escapeHtml(formatDate(poem.date))}</time></p>
          ${poemPathLinks(poem)}
        </header>
        <div class="poem-body">${renderPoemBody(poem.body)}
          <div class="seal-row"><img class="author-seal poem-seal" src="${url("/assets/nguyen-anh-seal.png")}" alt=""></div>
        </div>
        ${renderPoemFigure(poem, { resolveUrl: url, escape: escapeHtml })}
        <footer class="poem-ending">
          <button class="poem-share" type="button" data-share-poem data-share-title="${escapeHtml(`${poem.title} — Nguyên Anh`)}" aria-live="polite">Gửi bài thơ ni cho ai đó <span aria-hidden="true">→</span></button>
          ${footstepNavigation}
          ${secondaryNavigation}
        </footer>
      </article>`,
    });
    await writePage(`/tho/${poem.slug}/`, poemPage);
  }

  const aboutPage = layout({
    title: "Giới thiệu",
    description: "Đôi lời về Nguyên Anh và góc nhỏ dành cho thơ.",
    active: "about",
    canonicalPath: "/gioi-thieu/",
    content: `<article class="about shell">
      <header>
        <p class="eyebrow">Đôi lời</p>
        <h1>Mình viết để<br><em>giữ lại.</em></h1>
      </header>
      <div class="about__copy">
        <p>Đây là góc nhỏ để mình cất giữ những bài thơ — những điều đã nhìn thấy, đã đi qua, hoặc chỉ vừa kịp chạm vào trong một khoảnh khắc.</p>
        <p>Thơ ở đây được viết chậm, đọc chậm, và dành cho bất kỳ ai cần một khoảng lặng giữa những ngày nhiều tiếng động.</p>
        <div class="seal-row"><img class="author-seal about-seal" src="${url("/assets/nguyen-anh-seal.png")}" alt="Dấu triện Nguyên Anh"></div>
      </div>
    </article>`,
  });
  await writePage("/gioi-thieu/", aboutPage);

  const notFoundPage = layout({
    title: "Không tìm thấy trang",
    description: "Trang bạn tìm không tồn tại.",
    content: `<section class="not-found shell">
      <p class="eyebrow">404</p>
      <h1>Bài thơ ni chắc đi lạc mất rồi…</h1>
      <p>Mình về lại một nơi quen nhé, biết đâu có câu thơ đang đợi.</p>
      <div class="not-found__links">
        <a class="primary-link" href="${url("/")}">Về trang chủ <span aria-hidden="true">→</span></a>
        <a class="text-link" href="${url("/tho/")}">Đến trang thơ <span aria-hidden="true">→</span></a>
      </div>
    </section>`,
  });
  await writeFile(path.join(output, "404.html"), notFoundPage);
  await writeFile(path.join(output, ".nojekyll"), "");

  console.log(`Đã tạo website tĩnh từ ${poemCount} bài thơ, ${PATHS.length} Nẻo và ${guestPoems.length} bài khách thơ.`);
}

await build();
