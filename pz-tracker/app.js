import { CONVEX_URL } from "./config.js";
import { bookImportIds } from "./book-import.js";

const $ = (id) => document.getElementById(id);
const categories = ["Books", "Videos", "Magazines", "Misc"];
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

function message(text) { $("message").textContent = text; }
function render() {
  if (!catalog) return;
  $("import-control").hidden = category !== "Books";
  $("import-books").disabled = !ready || importing;
  const search = $("search").value.trim().toLowerCase();
  const filter = $("filter").value;
  const items = catalog.items.filter((item) => item.category === category
    && `${item.title} ${item.effect} ${item.kind}`.toLowerCase().includes(search)
    && (filter === "all" || collected.has(item.id) === (filter === "collected")));
  if (category === "Videos") {
    items.sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true, sensitivity: "base" }));
  }
  const focusedItem = document.activeElement?.dataset.itemId;
  const table = $("items").closest("table");
  table.classList.toggle("books", category === "Books");
  const headings = category === "Books" ? ["Skill", "I", "II", "III", "IV", "V"] : ["Owned", "Title", "Skill / learning", "Type"];
  const headingRow = document.createElement("tr");
  for (const text of headings) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = text;
    headingRow.append(th);
  }
  table.querySelector("thead").replaceChildren(headingRow);
  function checkboxCell(item) {
    const cell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.itemId = item.id;
    checkbox.checked = collected.has(item.id);
    checkbox.disabled = !ready || pending.has(item.id);
    checkbox.setAttribute("aria-label", `Collected: ${item.title}`);
    checkbox.title = item.title;
    checkbox.addEventListener("change", () => save(item.id, checkbox.checked));
    cell.append(checkbox);
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
      label.textContent = skill;
      row.append(label);
      books.sort((a, b) => Number(a.id.slice(-1)) - Number(b.id.slice(-1)));
      for (const book of books) row.append(checkboxCell(book));
      return row;
    });
  } else {
    rows = items.map((item) => {
    const row = document.createElement("tr");
    row.classList.toggle("owned", collected.has(item.id));
    row.append(checkboxCell(item));
    for (const text of [item.title, item.effect, item.kind]) {
      const td = document.createElement("td");
      td.textContent = text;
      row.append(td);
    }
    return row;
    });
  }
  $("items").replaceChildren(...rows);
  if (focusedItem) {
    const target = Array.from($("items").querySelectorAll("input")).find((input) => input.dataset.itemId === focusedItem);
    target?.focus();
  }
  $("summary").textContent = `${category === "Books" ? rows.length + " skills" : items.length + " items"} shown`;
  $("empty").hidden = rows.length > 0;
  $("empty").textContent = category === "Misc" && !catalog.items.some((item) => item.category === "Misc")
    ? "No additional vanilla learning items verified outside books, videos, and magazines."
    : "No matching items.";
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
$("search").addEventListener("input", render);
$("filter").addEventListener("change", render);
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
