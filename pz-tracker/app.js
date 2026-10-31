import { CONVEX_URL } from "./config.js";
import { bookImportIds } from "./book-import.js";

const $ = (id) => document.getElementById(id);
const categories = ["Books", "Videos", "Magazines", "Misc"];
const ownershipFilters = new Map(categories.map((name) => [name, "all"]));
let catalog;
let client;
let unsubscribe;
let teamId = null;
let category = "Books";
let collected = new Set();
let ready = false;
let generation = 0;
let importing = false;
const pending = new Set();
const miscOpenKinds = new Set();
const miscSearchClosed = new Set();
let visibleMiscKinds = [];

function miscIsOpen(kind) {
  return $("search").value.trim() ? !miscSearchClosed.has(kind) : miscOpenKinds.has(kind);
}

function miscSectionId(kind) {
  return `misc-${kind.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function setMiscOpen(kind, open) {
  if (open) miscOpenKinds.add(kind);
  else miscOpenKinds.delete(kind);
  if (open) miscSearchClosed.delete(kind);
  else miscSearchClosed.add(kind);
}

function message(text) { $("message").textContent = text; }
function render() {
  if (!catalog) return;
  $("import-control").hidden = category !== "Books";
  $("import-books").disabled = !ready || importing;
  const search = $("search").value.trim().toLowerCase();
  const filter = ownershipFilters.get(category);
  for (const button of $("filter").querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
  }
  const matchesOwnership = (item) => filter === "all" || collected.has(item.id) === (filter === "collected");
  const items = catalog.items.filter((item) => item.category === category
    && `${item.title} ${item.effect} ${item.kind}`.toLowerCase().includes(search)
    && matchesOwnership(item));
  $("misc-note").hidden = category !== "Misc";
  if (category === "Videos" || category === "Misc") {
    items.sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true, sensitivity: "base" }));
  }
  visibleMiscKinds = category === "Misc" ? [...new Set(items.map((item) => item.kind))] : [];
  $("misc-nav").hidden = category !== "Misc";
  $("catalog-layout").classList.toggle("misc-layout", category === "Misc");
  $("search").placeholder = category === "Misc" ? "Filter recipes or resource types..." : "Title, skill, recipe...";
  $("misc-toggle").disabled = visibleMiscKinds.length === 0;
  $("misc-toggle").textContent = visibleMiscKinds.length && visibleMiscKinds.every(miscIsOpen) ? "Collapse all" : "Expand all";
  const focusedItem = document.activeElement?.dataset.itemId;
  const focusedGroup = document.activeElement?.dataset.miscKind;
  const focusedJump = document.activeElement?.dataset.miscJump;
  const table = $("items").closest("table");
  table.classList.toggle("books", category === "Books");
  table.classList.toggle("misc", category === "Misc");
  table.classList.toggle("list", category === "Videos" || category === "Magazines");
  const headings = category === "Books" ? ["Skill", "I", "II", "III", "IV", "V"]
    : category === "Misc" ? ["Owned", "Recipe"]
    : category === "Magazines" ? ["Owned", "Title", "Skill / learning"]
    : ["Owned", "Title", "Skill / learning", "Type"];
  const headingRow = document.createElement("tr");
  for (const text of headings) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = text;
    if (text === "Owned") th.className = "owned-heading";
    headingRow.append(th);
  }
  table.querySelector("thead").replaceChildren(headingRow);
  function checkboxCell(item) {
    const cell = document.createElement("td");
    cell.className = "check-cell";
    const label = document.createElement("label");
    label.className = "hit";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.itemId = item.id;
    checkbox.checked = collected.has(item.id);
    checkbox.disabled = !ready || pending.has(item.id);
    checkbox.setAttribute("aria-label", `Collected: ${item.title}`);
    checkbox.title = item.title;
    checkbox.addEventListener("change", () => save(item.id, checkbox.checked));
    label.append(checkbox);
    cell.append(label);
    return cell;
  }
  let rows;
  if (category === "Books") {
    const matchingSkills = new Set(items.map((item) => item.effect.split(",")[0]));
    const groups = new Map();
    for (const item of catalog.items.filter((item) => item.category === "Books")) {
      const skill = item.effect.split(",")[0];
      if (!matchingSkills.has(skill)) continue;
      if (!groups.has(skill)) groups.set(skill, []);
      groups.get(skill).push(item);
    }
    rows = Array.from(groups, ([skill, books]) => {
      const row = document.createElement("tr");
      const label = document.createElement("th");
      label.scope = "row";
      label.className = "skill";
      label.textContent = skill;
      row.append(label);
      books.sort((a, b) => Number(a.id.slice(-1)) - Number(b.id.slice(-1)));
      for (const book of books) {
        if (matchesOwnership(book)) {
          row.append(checkboxCell(book));
        } else {
          const cell = document.createElement("td");
          cell.className = "check-cell filtered-volume";
          cell.textContent = "·";
          cell.setAttribute("aria-label", `${book.title}: not in current filter`);
          row.append(cell);
        }
      }
      return row;
    });
  } else {
    rows = [];
    let previousKind;
    for (const item of items) {
      if (category === "Misc" && item.kind !== previousKind) {
        const group = document.createElement("tr");
        group.className = "group";
        const heading = document.createElement("th");
        heading.colSpan = 2;
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "group-toggle";
        toggle.id = miscSectionId(item.kind);
        toggle.dataset.miscKind = item.kind;
        toggle.setAttribute("aria-expanded", String(miscIsOpen(item.kind)));
        const indicator = document.createElement("span");
        indicator.setAttribute("aria-hidden", "true");
        indicator.textContent = miscIsOpen(item.kind) ? "▾" : "▸";
        toggle.append(indicator, document.createTextNode(item.kind));
        heading.append(toggle);
        group.append(heading);
        rows.push(group);
        previousKind = item.kind;
      }
      const row = document.createElement("tr");
      row.classList.toggle("owned", collected.has(item.id));
      if (category === "Misc") row.hidden = !miscIsOpen(item.kind);
      row.append(checkboxCell(item));
      const title = document.createElement("td");
      title.className = "item-title";
      title.textContent = category === "Misc" ? item.title.slice(item.kind.length + 2) : item.title;
      row.append(title);
      if (category !== "Misc") {
        const effect = document.createElement("td");
        effect.className = "effect";
        const prefix = /^([^:;]+): /.exec(item.effect);
        if (prefix) {
          const strong = document.createElement("strong");
          strong.textContent = prefix[0];
          const detail = document.createElement("span");
          detail.textContent = item.effect.slice(prefix[0].length);
          effect.append(strong, detail);
        } else {
          effect.textContent = item.effect;
        }
        row.append(effect);
      }
      if (category === "Videos") {
        const kind = document.createElement("td");
        kind.className = "item-kind";
        kind.textContent = item.kind;
        row.append(kind);
      }
      rows.push(row);
    }
  }
  let stripe = false;
  for (const row of rows) {
    if (row.classList.contains("group")) { stripe = false; continue; }
    row.classList.toggle("stripe", stripe);
    stripe = !stripe;
  }
  $("items").replaceChildren(...rows);
  const jumps = visibleMiscKinds.map((kind) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.miscJump = kind;
    button.textContent = kind;
    button.setAttribute("aria-label", `Open and jump to ${kind}`);
    return button;
  });
  $("misc-links").replaceChildren(...jumps);
  if (focusedGroup) {
    document.getElementById(miscSectionId(focusedGroup))?.focus({ preventScroll: true });
  } else if (focusedJump) {
    jumps.find((button) => button.dataset.miscJump === focusedJump)?.focus({ preventScroll: true });
  } else if (focusedItem) {
    const target = Array.from($("items").querySelectorAll("input")).find((input) => input.dataset.itemId === focusedItem);
    target?.focus({ preventScroll: true });
  }
  $("summary").textContent = `${category === "Books" ? rows.length + " skills" : items.length + " items"} shown`;
  $("empty").hidden = rows.length > 0;
  $("empty").textContent = "No matching items.";
}

async function save(itemId, value) {
  if (!ready || !teamId) return;
  const currentGeneration = generation;
  pending.add(itemId);
  message("");
  render();
  try {
    await client.mutation("library:setCollected", { teamId, itemId, collected: value });
    // The reactive query is the source of truth, including concurrent team edits.
  } catch (error) {
    if (currentGeneration === generation) message(`Could not save. ${error.message}`);
  } finally {
    if (currentGeneration === generation) {
      pending.delete(itemId);
      render();
    }
  }
}

function route() {
  generation++;
  const currentGeneration = generation;
  unsubscribe?.();
  unsubscribe = undefined;
  collected = new Set();
  pending.clear();
  miscOpenKinds.clear();
  miscSearchClosed.clear();
  importing = false;
  ready = false;
  teamId = null;
  message("");
  const hash = location.hash;
  const match = /^#\/team\/([a-f0-9]{48})$/.exec(hash);
  $("welcome").hidden = Boolean(match);
  $("team").hidden = !match;
  if (match) {
    teamId = match[1];
    $("team-link").value = location.href;
    $("sync").textContent = "Connecting...";
    if (client) {
      unsubscribe = client.onUpdate("library:list", { teamId }, (ids) => {
        if (currentGeneration !== generation) return;
        collected = new Set(ids);
        ready = true;
        $("sync").textContent = "Live shared library";
        render();
      }, (error) => {
        if (currentGeneration !== generation) return;
        ready = false;
        $("sync").textContent = "Connection error";
        message(`Could not load the team library. ${error.message}`);
        render();
      });
    } else {
      $("sync").textContent = "Shared state not configured";
      message("Catalog preview only. Configure the Convex deployment URL to enable shared checkboxes.");
    }
  } else if (hash && hash !== "#/" && hash !== "#") {
    message("Invalid team link. Use the complete link from your team, or create a new library.");
  } else if (!client) {
    message("Catalog preview. Shared libraries will be available after Convex setup.");
  }
  $("create").disabled = !client;
  render();
}

$("create").addEventListener("click", () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  location.hash = `/team/${id}`;
});
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    message("Team link copied. Anyone with it can edit this library.");
  } catch {
    $("team-link").select();
    message("Copy the selected link to share this library.");
  }
});
$("tabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-category]");
  if (!button || !categories.includes(button.dataset.category)) return;
  category = button.dataset.category;
  for (const tab of $("tabs").querySelectorAll("button")) {
    tab.setAttribute("aria-pressed", String(tab === button));
  }
  render();
});
$("import-books").addEventListener("change", async (event) => {
  const input = event.target;
  const file = input.files?.[0];
  if (!file || !ready || !teamId || importing) return;
  const currentGeneration = generation;
  const importTeam = teamId;
  importing = true;
  message("Reading book import...");
  render();
  try {
    const ids = bookImportIds(JSON.parse(await file.text()), catalog);
    if (currentGeneration !== generation) return;
    if (!ids.length) {
      message("No checked books in this file. Nothing changed.");
      return;
    }
    const result = await client.mutation("library:importBooks", { teamId: importTeam, itemIds: ids });
    if (currentGeneration === generation) {
      message(`Imported ${ids.length} checked books (${result.added} newly collected). Existing selections kept.`);
    }
  } catch (error) {
    if (currentGeneration === generation) message(`Could not import books. ${error.message}`);
  } finally {
    input.value = "";
    if (currentGeneration === generation) {
      importing = false;
      render();
    }
  }
});
$("items").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-misc-kind]");
  if (!button) return;
  const kind = button.dataset.miscKind;
  setMiscOpen(kind, !miscIsOpen(kind));
  render();
});
$("misc-toggle").addEventListener("click", () => {
  const open = !visibleMiscKinds.every(miscIsOpen);
  for (const kind of visibleMiscKinds) setMiscOpen(kind, open);
  render();
});
$("misc-links").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-misc-jump]");
  if (!button) return;
  const kind = button.dataset.miscJump;
  setMiscOpen(kind, true);
  render();
  const heading = document.getElementById(miscSectionId(kind));
  heading?.scrollIntoView({ block: "start" });
  heading?.focus({ preventScroll: true });
});
$("search").addEventListener("input", () => {
  miscSearchClosed.clear();
  render();
});
$("filter").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button || !["all", "collected", "missing"].includes(button.dataset.filter)) return;
  ownershipFilters.set(category, button.dataset.filter);
  render();
});
window.addEventListener("hashchange", route);
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) { unsubscribe?.(); void client?.close(); }
});

try {
  const response = await fetch("./catalog.json");
  if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
  catalog = await response.json();
  $("version").textContent = catalog.version;
  $("catalog-note").textContent = catalog.notes;
  for (const source of catalog.sources) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = source.url;
    link.textContent = source.label;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    li.append(link);
    $("sources").append(li);
  }
  if (CONVEX_URL) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/convex@1.49.0/dist/browser.bundle.js";
      script.referrerPolicy = "no-referrer";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Convex client could not load. Check connectivity and reload."));
      document.head.append(script);
    });
    client = new globalThis.convex.ConvexClient(CONVEX_URL);
    client.subscribeToConnectionState((state) => {
      if (!teamId) return;
      $("sync").textContent = state.isWebSocketConnected
        ? (ready ? "Live shared library" : "Loading collection...")
        : "Offline. Waiting to reconnect...";
    });
  }
  route();
} catch (error) {
  $("create").disabled = true;
  message(`Unable to initialize the library. ${error.message}`);
}
