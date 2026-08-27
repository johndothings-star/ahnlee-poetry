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

export function parseFrontmatter(source, fileName = "Bài thơ", options = {}) {
  const {
    requiredFields = ["title", "date", "excerpt"],
    validateJourney = true,
  } = options;
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

  for (const key of requiredFields) {
    if (!metadata[key]) throw new Error(`${fileName}: thiếu trường ${key}.`);
  }

  if (validateJourney) {
    if (metadata.path && !PATH_BY_SLUG.has(metadata.path)) {
      throw new Error(`${fileName}: path “${metadata.path}” không hợp lệ.`);
    }
    if (metadata.secondary_path && !PATH_BY_SLUG.has(metadata.secondary_path)) {
      throw new Error(`${fileName}: secondary_path “${metadata.secondary_path}” không hợp lệ.`);
    }
    if (metadata.themes !== undefined && (!Array.isArray(metadata.themes) || metadata.themes.length === 0)) {
      throw new Error(`${fileName}: themes phải có ít nhất một chủ đề.`);
    }
  }
  if (metadata.image && !metadata.image_alt) {
    throw new Error(`${fileName}: có image thì phải có image_alt.`);
  }
  if (metadata.gallery !== undefined && (!Array.isArray(metadata.gallery) || metadata.gallery.length === 0)) {
    throw new Error(`${fileName}: gallery phải có ít nhất một ảnh.`);
  }
  if (metadata.gallery && !metadata.image) {
    throw new Error(`${fileName}: có gallery thì phải có image chính.`);
  }

  return { metadata, body: match[2].trim() };
}

export function parseGuestPoemFrontmatter(source, fileName = "Bài thơ khách") {
  const parsed = parseFrontmatter(source, fileName, {
    requiredFields: ["title", "author"],
    validateJourney: false,
  });

  for (const key of ["path", "secondary_path", "themes", "gallery"]) {
    if (parsed.metadata[key] !== undefined) {
      throw new Error(`${fileName}: thơ khách không dùng trường ${key}.`);
    }
  }
  if (!parsed.body) throw new Error(`${fileName}: nội dung bài thơ đang trống.`);
  return parsed;
}

export function chooseNextFootstep(poem, poems) {
  if (!poem.path) return null;
  const pathPoems = poems.filter((candidate) => candidate.path === poem.path);
  if (pathPoems.length < 2) return null;

  const currentIndex = pathPoems.findIndex((candidate) => candidate.slug === poem.slug);
  if (currentIndex < 0) return null;
  return {
    previous: pathPoems[(currentIndex - 1 + pathPoems.length) % pathPoems.length],
    candidate: pathPoems[(currentIndex + 1) % pathPoems.length],
  };
}

export function renderPoemFigure(poem, { resolveUrl, escape }) {
  if (!poem.image) return "";
  const dimensions = (value) => value ? ` width="${value.width}" height="${value.height}"` : "";
  const gallery = poem.gallery || [];
  return `<section class="poem-images" aria-label="Ảnh trải nghiệm gắn với bài thơ">
    <figure class="poem-figure poem-figure--cover">
      <img src="${resolveUrl(poem.image)}" alt="${escape(poem.image_alt)}"${dimensions(poem.image_dimensions)} loading="lazy" decoding="async">
      ${poem.image_caption ? `<figcaption>${escape(poem.image_caption)}</figcaption>` : ""}
    </figure>
    ${gallery.length ? `<div class="poem-gallery">
      ${gallery.map((image, index) => `<figure class="poem-figure"><img src="${resolveUrl(image)}" alt="${escape(`${poem.image_alt} — ảnh ${index + 2}`)}"${dimensions(poem.gallery_dimensions?.[index])} loading="lazy" decoding="async"></figure>`).join("\n      ")}
    </div>` : ""}
  </section>`;
}
