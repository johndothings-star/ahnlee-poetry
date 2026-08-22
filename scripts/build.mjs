import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const poemsDirectory = path.join(root, "content", "poems");
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

function parseFrontmatter(source, fileName) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`${fileName}: thiếu frontmatter.`);

  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator === -1) throw new Error(`${fileName}: frontmatter không hợp lệ.`);
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    metadata[key] = value;
  }

  for (const key of ["title", "date", "excerpt"]) {
    if (!metadata[key]) throw new Error(`${fileName}: thiếu trường ${key}.`);
  }

  return { metadata, body: match[2].trim() };
}

async function readPoems() {
  const files = (await readdir(poemsDirectory)).filter((file) => file.endsWith(".md"));
  const poems = await Promise.all(files.map(async (file) => {
    const source = await readFile(path.join(poemsDirectory, file), "utf8");
    const { metadata, body } = parseFrontmatter(source, file);
    return {
      ...metadata,
      body,
      slug: file.replace(/\.md$/, ""),
      featured: metadata.featured === "true",
    };
  }));
  return poems.sort((a, b) => b.date.localeCompare(a.date));
}

function formatDate(date) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function poemCard(poem) {
  return `<article class="poem-card">
    <time class="poem-card__date" datetime="${escapeHtml(poem.date)}">${escapeHtml(formatDate(poem.date))}</time>
    <h3><a href="${url(`/tho/${poem.slug}/`)}">${escapeHtml(poem.title)}</a></h3>
    <p>${escapeHtml(poem.excerpt)}</p>
    <a class="text-link" href="${url(`/tho/${poem.slug}/`)}" aria-label="Đọc bài ${escapeHtml(poem.title)}">Đọc bài thơ <span aria-hidden="true">→</span></a>
  </article>`;
}

function layout({ title, description, active = "", type = "website", publishedTime = "", scripts = [], content }) {
  const pageTitle = title === "Nguyên Anh" ? "Nguyên Anh — Thơ" : `${title} — Nguyên Anh`;
  const socialImage = type === "article" ? "" : `${siteOrigin}${url("/assets/og-preview.png")}`;
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
  ${socialImage ? `<meta property="og:image" content="${socialImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Nguyên Anh — Thơ, và những khoảng lặng.">` : ""}
  ${publishedTime ? `<meta property="article:published_time" content="${escapeHtml(publishedTime)}">` : ""}
  <meta name="twitter:card" content="${socialImage ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  ${socialImage ? `<meta name="twitter:image" content="${socialImage}">
  <meta name="twitter:image:alt" content="Nguyên Anh — Thơ, và những khoảng lặng.">` : ""}
  <title>${escapeHtml(pageTitle)}</title>
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
  await cp(path.join(root, "src", "assets", "nguyen-anh-seal.png"), path.join(output, "assets", "nguyen-anh-seal.png"));
  await cp(path.join(root, "src", "assets", "favicon.png"), path.join(output, "assets", "favicon.png"));
  await cp(path.join(root, "src", "assets", "og-preview.png"), path.join(output, "assets", "og-preview.png"));

  const poems = await readPoems();
  const featured = poems.filter((poem) => poem.featured).slice(0, 3);
  const selected = featured.length ? featured : poems.slice(0, 3);
  const years = [...new Set(poems.map((poem) => poem.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  const poemUrls = poems.map((poem) => url(`/tho/${poem.slug}/`));

  const home = layout({
    title: "Nguyên Anh",
    description: "Những bài thơ về ký ức, thiên nhiên và những khoảng lặng trong đời sống.",
    active: "home",
    scripts: ["/assets/archive.js"],
    content: `<section class="hero shell">
      <p class="eyebrow">Một góc nhỏ dành cho thơ</p>
      <h1>Có những điều<br>chỉ thơ mới <em>nói được.</em></h1>
      <p class="hero__intro">Những ghi chép bằng câu chữ về ký ức, thiên nhiên và những khoảng lặng trong đời sống.</p>
      <a class="primary-link" href="${url("/tho/")}">Đọc tất cả bài thơ <span aria-hidden="true">→</span></a>
      <p class="hero__surprise">Hôm ni đọc chi? <a class="surprise-link" href="${poemUrls[0] || url("/tho/")}" data-random-poem-link data-poem-urls="${escapeHtml(JSON.stringify(poemUrls))}">Một bài bất chợt <span aria-hidden="true">→</span></a></p>
    </section>
    <section class="featured shell" aria-labelledby="poems-heading">
      <div class="section-heading">
        <div><p class="eyebrow">Thơ chọn đọc</p><h2 id="poems-heading">Một vài bài thơ</h2></div>
        <a class="text-link desktop-link" href="${url("/tho/")}">Xem tất cả <span aria-hidden="true">→</span></a>
      </div>
      <div class="poem-grid">${selected.map(poemCard).join("")}</div>
    </section>`,
  });

  await writePage("/", home);

  const poemsPage = layout({
    title: "Thơ",
    description: "Tất cả bài thơ của Nguyên Anh, sắp xếp từ mới nhất.",
    active: "poems",
    scripts: ["/assets/archive.js"],
    content: `<header class="page-heading shell">
      <p class="eyebrow">Tuyển tập</p>
      <h1>Thơ</h1>
      <p>Những bài thơ được xếp theo ngày viết, từ mới nhất đến cũ hơn.</p>
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
        <button class="random-poem" id="random-poem" type="button"${poems.length ? "" : " disabled"}>Một bài ngẫu nhiên <span aria-hidden="true">→</span></button>
      </div>
      <p class="archive-summary" id="archive-summary" aria-live="polite">${poems.length} bài thơ</p>
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
      <p class="archive-empty" id="archive-empty"${poems.length ? " hidden" : ""}>Không tìm thấy bài thơ phù hợp. Thử một từ khóa khác hoặc xem tất cả các năm nhé.</p>
    </section>`,
  });
  await writePage("/tho/", poemsPage);

  for (const poem of poems) {
    const poemPage = layout({
      title: poem.title,
      description: poem.excerpt,
      active: "poems",
      type: "article",
      publishedTime: poem.date,
      content: `<article class="poem-reader shell">
        <header class="poem-reader__header">
          <a class="back-link" href="${url("/tho/")}"><span aria-hidden="true">←</span> Tất cả bài thơ</a>
          <h1>${escapeHtml(poem.title)}</h1>
          <p class="poem-date"><span>Sáng tác</span><time datetime="${escapeHtml(poem.date)}">${escapeHtml(formatDate(poem.date))}</time></p>
        </header>
        <div class="poem-body">${renderPoemBody(poem.body)}
          <div class="seal-row"><img class="author-seal poem-seal" src="${url("/assets/nguyen-anh-seal.png")}" alt=""></div>
        </div>
      </article>`,
    });
    await writePage(`/tho/${poem.slug}/`, poemPage);
  }

  const aboutPage = layout({
    title: "Giới thiệu",
    description: "Đôi lời về Nguyên Anh và góc nhỏ dành cho thơ.",
    active: "about",
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

  console.log(`Đã tạo ${poems.length + 4} trang tĩnh từ ${poems.length} bài thơ.`);
}

await build();
