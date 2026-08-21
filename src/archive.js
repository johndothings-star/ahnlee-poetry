export function normalizeSearch(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("vi")
    .trim();
}

export function poemMatches(poem, query = "", year = "") {
  const matchesTitle = normalizeSearch(poem.title).includes(normalizeSearch(query));
  const matchesYear = !year || poem.year === year;
  return matchesTitle && matchesYear;
}

export function chooseRandomIndex(length, random = Math.random) {
  if (!Number.isInteger(length) || length < 1) return -1;
  return Math.min(length - 1, Math.floor(random() * length));
}

function setupArchive() {
  const search = document.querySelector("#poem-search");
  const year = document.querySelector("#year-filter");
  const randomButton = document.querySelector("#random-poem");
  const summary = document.querySelector("#archive-summary");
  const empty = document.querySelector("#archive-empty");
  const items = [...document.querySelectorAll("[data-poem-item]")];

  if (!search || !year || !summary || !empty) return;

  function updateArchive() {
    let visibleCount = 0;
    for (const item of items) {
      const visible = poemMatches(
        { title: item.dataset.title || "", year: item.dataset.year || "" },
        search.value,
        year.value,
      );
      item.hidden = !visible;
      if (visible) visibleCount += 1;
    }
    summary.textContent = visibleCount ? `${visibleCount} bài thơ` : "Không có kết quả";
    empty.hidden = visibleCount > 0;
  }

  search.addEventListener("input", updateArchive);
  year.addEventListener("change", updateArchive);
  randomButton?.addEventListener("click", () => {
    const urls = items.map((item) => item.dataset.url).filter(Boolean);
    const index = chooseRandomIndex(urls.length);
    if (index >= 0) window.location.assign(urls[index]);
  });
}

if (typeof document !== "undefined") setupArchive();
