import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./content.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const poemsDirectory = path.join(root, "content", "poems");
const assetsDirectory = path.join(root, "src", "assets", "poems");
const sourceDirectory = path.resolve(process.argv[2] || "D:\\GitHub\\anh-tho");
const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// Chỉ những sai khác tên đã xác nhận rõ ràng mới được ánh xạ thủ công.
const manualAliases = new Map([
  ["cao-son-co-moc", "co-moc-cao-son"],
  ["du-xuan-ha-noi", "du-xuan-ha-hoi"],
  ["phuc-duyen-sen-chan-thien-nhan", "phuc-duyen-sen-chan-thien-nhan"],
]);

function parseSourceName(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (!supportedExtensions.has(extension)) return null;
  const stem = path.basename(fileName, path.extname(fileName)).toLowerCase();
  const match = stem.match(/^(.*)-(?:image(\d+)?|iamge)$/);
  if (!match) return null;
  return {
    base: match[1],
    number: match[2] ? Number(match[2]) : null,
    extension,
  };
}

function replaceImageFrontmatter(source, { image, imageAlt, gallery }) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---([\s\S]*)$/);
  if (!match) throw new Error("Thiếu frontmatter.");

  const removable = new Set(["image", "image_alt", "gallery"]);
  const lines = match[1].split(/\r?\n/);
  const kept = [];
  for (let index = 0; index < lines.length; index += 1) {
    const field = lines[index].match(/^([a-zA-Z][a-zA-Z0-9_]*):/);
    if (!field || !removable.has(field[1])) {
      kept.push(lines[index]);
      continue;
    }
    while (lines[index + 1]?.match(/^\s+-\s+/)) index += 1;
  }

  kept.push(`image: ${JSON.stringify(image)}`);
  kept.push(`image_alt: ${JSON.stringify(imageAlt)}`);
  if (gallery.length) kept.push(`gallery: ${JSON.stringify(gallery)}`);
  return `---\n${kept.join("\n").trimEnd()}\n---${match[2]}`;
}

const poemFiles = (await readdir(poemsDirectory)).filter((file) => file.endsWith(".md"));
const poems = new Map();
for (const file of poemFiles) {
  const source = await readFile(path.join(poemsDirectory, file), "utf8");
  const slug = file.replace(/\.md$/, "");
  const { metadata } = parseFrontmatter(source, file);
  poems.set(slug, { file, source, title: metadata.title });
}

const sourceFiles = (await readdir(sourceDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort((first, second) => first.localeCompare(second, "vi", { numeric: true }));

const groups = new Map();
const unmatched = [];
const manualMappings = new Map();

for (const file of sourceFiles) {
  const parsed = parseSourceName(file);
  if (!parsed) {
    unmatched.push(file);
    continue;
  }

  let slug = poems.has(parsed.base) ? parsed.base : manualAliases.get(parsed.base);
  if (!slug || !poems.has(slug)) {
    unmatched.push(file);
    continue;
  }
  if (slug !== parsed.base || file.toLowerCase().includes("-iamge")) {
    manualMappings.set(parsed.base, slug);
  }
  const entries = groups.get(slug) || [];
  entries.push({ file, ...parsed });
  groups.set(slug, entries);
}

let importedImages = 0;
let poemsWithMultipleImages = 0;

for (const [slug, entries] of groups) {
  entries.sort((first, second) => {
    if (first.number === null) return -1;
    if (second.number === null) return 1;
    return first.number - second.number || first.file.localeCompare(second.file, "vi");
  });

  const [main, ...secondary] = entries;
  const targetDirectory = path.join(assetsDirectory, slug);
  await mkdir(targetDirectory, { recursive: true });

  const mainName = `cover${main.extension}`;
  await copyFile(path.join(sourceDirectory, main.file), path.join(targetDirectory, mainName));
  const gallery = [];
  for (let index = 0; index < secondary.length; index += 1) {
    const item = secondary[index];
    const targetName = `${String(index + 1).padStart(2, "0")}${item.extension}`;
    await copyFile(path.join(sourceDirectory, item.file), path.join(targetDirectory, targetName));
    gallery.push(`/assets/poems/${slug}/${targetName}`);
  }

  const poem = poems.get(slug);
  const updated = replaceImageFrontmatter(poem.source, {
    image: `/assets/poems/${slug}/${mainName}`,
    imageAlt: `Ảnh trải nghiệm gắn với bài thơ ${poem.title}`,
    gallery,
  });
  await writeFile(path.join(poemsDirectory, poem.file), updated, "utf8");
  importedImages += entries.length;
  if (entries.length > 1) poemsWithMultipleImages += 1;
}

console.log(`Đã nhập ${importedImages} ảnh cho ${groups.size} bài thơ.`);
console.log(`Có ${poemsWithMultipleImages} bài dùng nhiều ảnh.`);
if (manualMappings.size) {
  console.log("Ánh xạ thủ công đã dùng:");
  for (const [source, target] of manualMappings) console.log(`- ${source} -> ${target}`);
}
if (unmatched.length) {
  console.log("Ảnh chưa ghép vì tên chưa đủ chắc chắn:");
  for (const file of unmatched) console.log(`- ${file}`);
}
