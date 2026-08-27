import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./content.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const poemsDirectory = path.join(root, "content", "poems");
const assetsDirectory = path.join(root, "src", "assets", "poems");
const sourceDirectory = path.resolve(process.argv[2] || "D:\\GitHub\\anh-tho");
const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function parseSourceName(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (!supportedExtensions.has(extension)) return null;
  const stem = path.basename(fileName, path.extname(fileName)).toLowerCase();
  const match = stem.match(/^(.*)-image(\d+)?$/);
  if (!match) return null;
  return {
    base: match[1],
    number: match[2] ? Number(match[2]) : null,
    extension,
  };
}

async function fileHash(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function collectAssetHashes(directory) {
  const hashes = new Set();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const hash of await collectAssetHashes(target)) hashes.add(hash);
    } else if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
      hashes.add(await fileHash(target));
    }
  }
  return hashes;
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
  poems.set(slug, { file, source, metadata, title: metadata.title });
}

const sourceFiles = (await readdir(sourceDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort((first, second) => first.localeCompare(second, "vi", { numeric: true }));

const groups = new Map();
const unmatched = [];
let alreadyImported = 0;
const importedHashes = await collectAssetHashes(assetsDirectory);

for (const file of sourceFiles) {
  const parsed = parseSourceName(file);
  if (!parsed) {
    const extension = path.extname(file).toLowerCase();
    if (supportedExtensions.has(extension) && importedHashes.has(await fileHash(path.join(sourceDirectory, file)))) {
      alreadyImported += 1;
      continue;
    }
    unmatched.push(file);
    continue;
  }

  const slug = parsed.base;
  if (!poems.has(slug)) {
    if (importedHashes.has(await fileHash(path.join(sourceDirectory, file)))) {
      alreadyImported += 1;
      continue;
    }
    unmatched.push(file);
    continue;
  }
  const entries = groups.get(slug) || [];
  entries.push({ file, ...parsed });
  groups.set(slug, entries);
}

let newImages = 0;
let updatedPoems = 0;

for (const [slug, entries] of groups) {
  entries.sort((first, second) => {
    if (first.number === null) return -1;
    if (second.number === null) return 1;
    return first.number - second.number || first.file.localeCompare(second.file, "vi");
  });

  const targetDirectory = path.join(assetsDirectory, slug);
  await mkdir(targetDirectory, { recursive: true });

  const poem = poems.get(slug);
  let image = poem.metadata.image || "";
  const gallery = [...(poem.metadata.gallery || [])];
  const knownHashes = new Set();
  const existingNames = new Set();
  let nextGalleryIndex = 1;

  for (const entry of await readdir(targetDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    existingNames.add(entry.name.toLowerCase());
    const numbered = path.basename(entry.name, path.extname(entry.name)).match(/^(\d+)$/);
    if (numbered) nextGalleryIndex = Math.max(nextGalleryIndex, Number(numbered[1]) + 1);
    knownHashes.add(await fileHash(path.join(targetDirectory, entry.name)));
  }

  let addedForPoem = 0;
  for (const item of entries) {
    const source = path.join(sourceDirectory, item.file);
    const hash = await fileHash(source);
    if (knownHashes.has(hash)) {
      alreadyImported += 1;
      continue;
    }

    let targetName;
    if (!image) {
      targetName = `cover${item.extension}`;
      if (existingNames.has(targetName.toLowerCase())) {
        unmatched.push(`${item.file} (trùng tên đích nhưng khác nội dung)`);
        continue;
      }
      image = `/assets/poems/${slug}/${targetName}`;
    } else {
      while ([...existingNames].some((name) => new RegExp(`^${String(nextGalleryIndex).padStart(2, "0")}\\.`).test(name))) {
        nextGalleryIndex += 1;
      }
      targetName = `${String(nextGalleryIndex).padStart(2, "0")}${item.extension}`;
      nextGalleryIndex += 1;
      gallery.push(`/assets/poems/${slug}/${targetName}`);
    }

    await copyFile(source, path.join(targetDirectory, targetName));
    existingNames.add(targetName.toLowerCase());
    knownHashes.add(hash);
    newImages += 1;
    addedForPoem += 1;
  }

  if (addedForPoem) {
    const updated = replaceImageFrontmatter(poem.source, {
      image,
      imageAlt: poem.metadata.image_alt || `Ảnh trải nghiệm gắn với bài thơ ${poem.title}`,
      gallery,
    });
    if (updated !== poem.source) {
      await writeFile(path.join(poemsDirectory, poem.file), updated, "utf8");
      updatedPoems += 1;
    }
  }
}

console.log(`Ảnh mới được thêm: ${newImages}`);
console.log(`Bài thơ được cập nhật: ${updatedPoems}`);
console.log(`Ảnh đã có, được bỏ qua: ${alreadyImported}`);
if (unmatched.length) {
  console.log("Ảnh không match, không được nhập:");
  for (const file of unmatched) console.log(`- ${file}`);
} else {
  console.log("Ảnh không match: 0");
}
