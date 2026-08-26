export const PATHS = [
  {
    slug: "neo-que",
    route: "que",
    name: "Nẻo Quê",
    shortName: "Quê",
    preface: "Nơi Chân trần bắt đầu, từ mái nhà, ngõ nhỏ, vườn cây và những ký ức thân quen.",
  },
  {
    slug: "neo-tinh",
    route: "tinh",
    name: "Nẻo Tình",
    shortName: "Tình",
    preface: "Chân trần có thương, có nhớ, có những mối duyên đi cùng năm tháng, cũng có những chuyện tình chẳng phải chữ tình.",
  },
  {
    slug: "neo-phieu-du",
    route: "phieu-du",
    name: "Nẻo Phiêu Du",
    shortName: "Phiêu Du",
    preface: "Chân trần đi qua núi, sông, mây, gió; mỗi miền đất một dấu chân, mỗi cảnh sắc một miền nhớ.",
  },
  {
    slug: "neo-doi",
    route: "doi",
    name: "Nẻo Đời",
    shortName: "Đời",
    preface: "Chân trần bước giữa nhân gian, nếm vui buồn, được mất, nhìn chuyện người để ngẫm chuyện đời.",
  },
  {
    slug: "neo-thanh-nhan",
    route: "thanh-nhan",
    name: "Nẻo Thanh Nhàn",
    shortName: "Thanh Nhàn",
    preface: "Chân trần chậm lại bên chén trà, góc vườn, một chút thảnh thơi giữa những ngày tất bật.",
  },
  {
    slug: "neo-tam",
    route: "tam",
    name: "Nẻo Tâm",
    shortName: "Tâm",
    preface: "Đi qua muôn nẻo, Chân trần trở về soi lại chính mình, tìm về nơi sâu thẳm của Tâm.",
  },
];

export const PATH_BY_SLUG = new Map(PATHS.map((item) => [item.slug, item]));

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseInlineList(value, fileName, key) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error();
    return parsed.map((item) => item.trim()).filter(Boolean);
  } catch {
    throw new Error(`${fileName}: trường ${key} phải là một danh sách chuỗi hợp lệ.`);
  }
}

export function parseFrontmatter(source, fileName = "Bài thơ") {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`${fileName}: thiếu frontmatter.`);

  const metadata = {};
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const field = line.match(/^([a-zA-Z][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!field) throw new Error(`${fileName}: frontmatter không hợp lệ ở dòng “${line.trim()}”.`);
    const [, key, rawValue] = field;

    if (!rawValue && lines[index + 1]?.match(/^\s+-\s+/)) {
      const values = [];
      while (lines[index + 1]?.match(/^\s+-\s+(.*)$/)) {
        index += 1;
        values.push(unquote(lines[index].replace(/^\s+-\s+/, "").trim()));
      }
      metadata[key] = values.filter(Boolean);
    } else if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      metadata[key] = parseInlineList(rawValue, fileName, key);
    } else {
      metadata[key] = unquote(rawValue);
    }
  }

  for (const key of ["title", "date", "excerpt"]) {
    if (!metadata[key]) throw new Error(`${fileName}: thiếu trường ${key}.`);
  }

  if (metadata.path && !PATH_BY_SLUG.has(metadata.path)) {
    throw new Error(`${fileName}: path “${metadata.path}” không hợp lệ.`);
  }
  if (metadata.secondary_path && !PATH_BY_SLUG.has(metadata.secondary_path)) {
    throw new Error(`${fileName}: secondary_path “${metadata.secondary_path}” không hợp lệ.`);
  }
  if (metadata.themes !== undefined && (!Array.isArray(metadata.themes) || metadata.themes.length === 0)) {
    throw new Error(`${fileName}: themes phải có ít nhất một chủ đề.`);
  }
  if (metadata.image && !metadata.image_alt) {
    throw new Error(`${fileName}: có image thì phải có image_alt.`);
  }

  return { metadata, body: match[2].trim() };
}

function sharedThemeCount(first, second) {
  const themes = new Set(first.themes || []);
  return (second.themes || []).filter((theme) => themes.has(theme)).length;
}

export function chooseNextFootstep(poem, poems) {
  const candidates = poems.filter((candidate) => candidate.slug !== poem.slug);
  if (!candidates.length) return null;

  return candidates
    .map((candidate, index) => {
      const sharedThemes = sharedThemeCount(poem, candidate);
      let score = 0;
      if (candidate.path === poem.path && sharedThemes) score += 100;
      if (poem.secondary_path && candidate.path === poem.secondary_path) score += 60;
      if (candidate.path === poem.path) score += 30;
      score += sharedThemes * 10;
      if (candidate.secondary_path === poem.path) score += 5;
      return { candidate, score, sharedThemes, index };
    })
    .sort((first, second) => second.score - first.score || first.index - second.index || first.candidate.slug.localeCompare(second.candidate.slug, "vi"))[0];
}

export function renderPoemFigure(poem, { resolveUrl, escape }) {
  if (!poem.image) return "";
  return `<figure class="poem-figure">
    <img src="${resolveUrl(poem.image)}" alt="${escape(poem.image_alt)}" loading="lazy" decoding="async">
    ${poem.image_caption ? `<figcaption>${escape(poem.image_caption)}</figcaption>` : ""}
  </figure>`;
}
