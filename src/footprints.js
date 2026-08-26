export const FOOTPRINT_STORAGE_KEY = "nguyen-anh-footprints-v1";

export function normalizeFootprints(value) {
  if (!Array.isArray(value)) return [];
  const unique = new Map();
  for (const item of value) {
    if (!item || typeof item.slug !== "string" || typeof item.title !== "string") continue;
    unique.set(item.slug, {
      slug: item.slug,
      path: typeof item.path === "string" ? item.path : "",
      title: item.title,
      url: typeof item.url === "string" ? item.url : "",
      date: typeof item.date === "string" ? item.date : "",
      visitedAt: Number.isFinite(item.visitedAt) ? item.visitedAt : 0,
    });
  }
  return [...unique.values()].sort((first, second) => second.visitedAt - first.visitedAt);
}

export function countFootprintsByPath(entries) {
  const counts = {};
  for (const entry of normalizeFootprints(entries)) counts[entry.path] = (counts[entry.path] || 0) + 1;
  return counts;
}

function loadFootprints() {
  try {
    return normalizeFootprints(JSON.parse(localStorage.getItem(FOOTPRINT_STORAGE_KEY) || "[]"));
  } catch {
    return [];
  }
}

function saveFootprints(entries) {
  try {
    localStorage.setItem(FOOTPRINT_STORAGE_KEY, JSON.stringify(normalizeFootprints(entries)));
  } catch {
    // Trình duyệt có thể chặn lưu cục bộ; trang thơ vẫn hoạt động bình thường.
  }
}

function rememberCurrentPoem() {
  const poem = document.querySelector("[data-footprint-poem]");
  if (!poem?.dataset.poemSlug) return;
  const entries = loadFootprints().filter((entry) => entry.slug !== poem.dataset.poemSlug);
  entries.push({
    slug: poem.dataset.poemSlug,
    path: poem.dataset.poemPath || "",
    title: poem.dataset.poemTitle || document.title,
    url: poem.dataset.poemUrl || window.location.pathname,
    date: poem.dataset.poemDate || "",
    visitedAt: Date.now(),
  });
  saveFootprints(entries);
}

function safeInternalUrl(value) {
  try {
    const target = new URL(value, window.location.href);
    if (target.origin !== window.location.origin) return "#";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "#";
  }
}

function renderFootprints() {
  const page = document.querySelector("[data-footprints-page]");
  if (!page) return;

  const entries = loadFootprints();
  const counts = countFootprintsByPath(entries);
  const pathNames = {};
  for (const summary of page.querySelectorAll("[data-footprint-summary]")) {
    const pathSlug = summary.dataset.footprintSummary;
    const pathName = summary.querySelector("a span")?.textContent || pathSlug;
    const count = counts[pathSlug] || 0;
    pathNames[pathSlug] = pathName;
    summary.querySelector("[data-footprint-count]").textContent = `${count} dấu chân`;
  }

  const list = page.querySelector("[data-footprint-list]");
  const empty = page.querySelector("[data-footprints-empty]");
  const clear = page.querySelector("[data-clear-footprints]");
  list.replaceChildren();
  empty.hidden = entries.length > 0;
  clear.disabled = entries.length === 0;

  for (const entry of entries) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    const pathName = document.createElement("span");
    link.href = safeInternalUrl(entry.url);
    link.textContent = entry.title;
    pathName.textContent = pathNames[entry.path] || "Chưa phân Nẻo";
    item.append(link, pathName);
    list.append(item);
  }

  clear.addEventListener("click", () => {
    try { localStorage.removeItem(FOOTPRINT_STORAGE_KEY); } catch { /* Không có dữ liệu máy chủ để xóa. */ }
    renderFootprints();
  }, { once: true });
}

if (typeof document !== "undefined") {
  rememberCurrentPoem();
  renderFootprints();
}
