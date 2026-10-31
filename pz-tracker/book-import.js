// Read pz-books.com version-1 exports. Import is additive: false never unchecks a book.
export function bookImportIds(data, catalog) {
  if (!data || typeof data !== "object" || Array.isArray(data) || data.version !== 1
    || !data.books || typeof data.books !== "object" || Array.isArray(data.books)) {
    throw new Error("Expected a version 1 skill-books export with a books object.");
  }
  const skills = new Map();
  for (const item of catalog.items.filter((item) => item.category === "Books")) {
    const skill = item.effect.split(",")[0].toLowerCase().replace(/\s+/g, "-");
    const volume = Number(item.id.slice(-1));
    if (!skills.has(skill)) skills.set(skill, new Map());
    skills.get(skill).set(volume, item.id);
  }
  const ids = [];
  for (const [skill, volumes] of Object.entries(data.books)) {
    const books = skills.get(skill);
    if (!books) throw new Error(`Unknown skill in import: ${skill}.`);
    if (!Array.isArray(volumes) || volumes.length !== 5 || !volumes.every((value) => typeof value === "boolean")) {
      throw new Error(`Expected five true/false values for ${skill}.`);
    }
    volumes.forEach((checked, index) => {
      const id = books.get(index + 1);
      if (!id) throw new Error(`No catalog book for ${skill}, volume ${index + 1}.`);
      if (checked) ids.push(id);
    });
  }
  return ids;
}
