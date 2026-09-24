// Streamlit file manager – Custom Components v2 frontend (vanilla JS, no build).
//
// Streamlit calls the default export on every rerun whose `data` changed,
// always with the same `parentElement` (shadow root). The app instance is
// therefore created once and stored on the parent; later calls only update it.

const HLJS_URL = "https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.10.0/es/highlight.min.js";
const HIGHLIGHT_LIMIT = 300 * 1024;

// Messages come from Python (st_filemanager/locales/*.json) in data.i18n.
// A message is either a string or an object keyed by Intl.PluralRules
// category ("zero", "one", "two", "few", "many", "other") selected by {n}.
const SIZE_PARAMS = new Set(["need", "free", "max", "used", "limit", "size"]);

const ICON_PATHS = {
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  text: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  archive: '<path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><rect x="1" y="3" width="22" height="5" rx="1"/><path d="M10 12h4"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8 16h1.5a1.5 1.5 0 0 0 0-3H8v5"/>',
  media: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  newFolder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>',
  rename: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  delete: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  paste: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};
const icon = (name, cls = "") =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;

const EXT_KIND = {};
for (const [kind, exts] of Object.entries({
  image: "png jpg jpeg gif webp bmp ico svg avif tif tiff heic",
  code: "py pyi js mjs cjs ts tsx jsx vue html htm css scss less json jsonl yaml yml toml xml sh bash zsh ps1 bat sql c h cpp hpp cc cs java kt go rs rb php swift r lua pl dart ipynb dockerfile makefile ini cfg conf env",
  text: "txt md markdown rst log tex bib srt vtt",
  table: "csv tsv xls xlsx ods",
  pdf: "pdf",
  archive: "zip tar gz tgz bz2 xz 7z rar zst",
  media: "mp3 wav ogg flac m4a aac mp4 mkv webm avi mov wmv",
})) for (const e of exts.split(" ")) EXT_KIND[e] = kind;
const PREVIEWABLE = new Set(["image", "code", "text", "table"]);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const joinPath = (dir, name) => (dir ? `${dir}/${name}` : name);

class FileManagerApp {
  constructor(parent) {
    this.parent = parent;
    this.root = parent.querySelector(".fm");
    this.data = null;
    this.entries = [];
    this.sort = { key: "name", dir: 1 };
    this.filter = "";
    this.selection = new Set();
    this.anchor = null;
    this.clipboard = null; // {mode: "cut"|"copy", dir, names: []}
    this.pendingId = null;
    this.lastFlashId = null;
    this.seq = 0;
    this.dragDepth = 0;
    this.build();
  }

  // ---------------------------------------------------------------- i18n
  t(key, params = {}) {
    let s = this.messages?.[key] ?? key;
    if (s && typeof s === "object") {
      const cat = this.plural.select(Number(params.n ?? 0));
      s = s[cat] ?? s.other ?? Object.values(s)[0] ?? key;
    }
    return String(s).replace(/\{(\w+)\}/g, (_, k) => {
      const v = params[k];
      if (v === undefined || v === null) return "";
      if (k === "names") return v; // pre-escaped list
      return esc(SIZE_PARAMS.has(k) && /^\d+$/.test(String(v)) ? this.fmtSize(Number(v)) : v);
    });
  }
  fmtSize(b) {
    if (b === null || b === undefined) return "";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return `${b.toLocaleString(this.lang, { maximumFractionDigits: i === 0 ? 0 : 1 })} ${u[i]}`;
  }
  fmtDate(ts) {
    if (!this.dateFmt) this.dateFmt = new Intl.DateTimeFormat(this.lang, { dateStyle: "short", timeStyle: "short" });
    return this.dateFmt.format(new Date(ts * 1000));
  }

  // --------------------------------------------------------------- build
  build() {
    const r = this.root;
    r.innerHTML = `
      <div class="fm-toolbar" role="toolbar">
        <button data-act="up" class="btn icon-only">${icon("up")}</button>
        <span class="sep"></span>
        <button data-act="newFolder" class="btn w">${icon("newFolder")}<span></span></button>
        <button data-act="upload" class="btn w">${icon("upload")}<span></span></button>
        <button data-act="download" class="btn w">${icon("download")}<span></span></button>
        <span class="sep w"></span>
        <button data-act="rename" class="btn icon-only w">${icon("rename")}</button>
        <button data-act="cut" class="btn icon-only w">${icon("cut")}</button>
        <button data-act="copy" class="btn icon-only w">${icon("copy")}</button>
        <button data-act="paste" class="btn icon-only w">${icon("paste")}</button>
        <button data-act="delete" class="btn icon-only w danger">${icon("delete")}</button>
        <span class="grow"></span>
        <label class="search">${icon("search")}<input type="search" spellcheck="false"></label>
        <button data-act="refresh" class="btn icon-only">${icon("refresh")}</button>
      </div>
      <div class="fm-pathbar"><nav class="crumbs"></nav><span class="badge ro" hidden>${icon("lock")}<span></span></span></div>
      <div class="fm-table" role="grid" aria-multiselectable="true">
        <div class="fm-head row" role="row">
          <span class="c-check"><input type="checkbox" class="check-all"></span>
          <span class="c-name sortable" data-sort="name"></span>
          <span class="c-size sortable" data-sort="size"></span>
          <span class="c-date sortable" data-sort="mtime"></span>
        </div>
        <div class="fm-body" tabindex="-1"></div>
        <div class="fm-drop"><div>${icon("upload")}<span></span></div></div>
      </div>
      <div class="fm-status">
        <span class="st-count"></span>
        <span class="st-clip" hidden></span>
        <span class="grow"></span>
        <span class="st-quota" hidden><span class="qbar"><span></span></span><span class="qtext"></span></span>
      </div>
      <div class="fm-toasts" aria-live="polite"></div>
      <div class="fm-menu" role="menu" hidden></div>
      <div class="fm-modal-layer" hidden></div>
      <div class="fm-busy" hidden><span class="spinner"></span></div>
      <input type="file" class="file-input" multiple hidden>`;
    const $ = (s) => r.querySelector(s);
    this.el = {
      toolbar: $(".fm-toolbar"), crumbs: $(".crumbs"), ro: $(".ro"), body: $(".fm-body"),
      head: $(".fm-head"), checkAll: $(".check-all"), drop: $(".fm-drop"), count: $(".st-count"),
      clip: $(".st-clip"), quota: $(".st-quota"), toasts: $(".fm-toasts"), menu: $(".fm-menu"),
      modal: $(".fm-modal-layer"), busy: $(".fm-busy"), file: $(".file-input"), search: $(".search input"),
    };
    this.bind();
  }

  bind() {
    const { el } = this;
    el.toolbar.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-act]");
      if (b && !b.disabled) this.command(b.dataset.act);
    });
    el.search.addEventListener("input", () => { this.filter = el.search.value.trim().toLowerCase(); this.renderList(); });
    el.search.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.search.value) { el.search.value = ""; this.filter = ""; this.renderList(); e.stopPropagation(); }
      if (e.key === "ArrowDown") { e.preventDefault(); el.body.focus(); this.moveFocus(1, false); }
    });
    el.head.addEventListener("click", (e) => {
      const h = e.target.closest("[data-sort]");
      if (!h) return;
      const k = h.dataset.sort;
      this.sort = this.sort.key === k ? { key: k, dir: -this.sort.dir } : { key: k, dir: k === "name" ? 1 : -1 };
      this.renderList();
    });
    el.checkAll.addEventListener("change", () => {
      const vis = this.visible();
      this.selection = el.checkAll.checked ? new Set(vis.map((x) => x.name)) : new Set();
      this.refreshSelection();
    });
    el.crumbs.addEventListener("click", (e) => {
      const c = e.target.closest("[data-path]");
      if (c) this.cd(c.dataset.path);
    });

    // rows
    el.body.addEventListener("click", (e) => {
      const row = e.target.closest(".row");
      if (!row) { if (!e.ctrlKey && !e.metaKey) { this.selection.clear(); this.refreshSelection(); } return; }
      const name = row.dataset.name;
      if (e.target.matches(".c-check input")) { this.toggle(name); this.anchor = name; this.refreshSelection(); return; }
      this.clickSelect(name, e);
    });
    el.body.addEventListener("dblclick", (e) => {
      const row = e.target.closest(".row");
      if (row && !e.target.matches(".c-check input")) this.openEntry(this.entry(row.dataset.name));
    });
    el.body.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const row = e.target.closest(".row");
      if (row && !this.selection.has(row.dataset.name)) { this.selection = new Set([row.dataset.name]); this.anchor = row.dataset.name; this.refreshSelection(); }
      if (!row) { this.selection.clear(); this.refreshSelection(); }
      this.showMenu(e.clientX, e.clientY, !!row);
    });

    // keyboard (only while focus is inside the component)
    this.root.addEventListener("keydown", (e) => this.onKey(e));

    // menu
    el.menu.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      this.hideMenu();
      this.command(b.dataset.act);
    });
    this.onDocDown = (e) => { if (!e.composedPath().includes(el.menu)) this.hideMenu(); };
    document.addEventListener("mousedown", this.onDocDown, true);

    // upload
    el.file.addEventListener("change", () => { this.startUpload([...el.file.files]); el.file.value = ""; });

    // drag & drop: external files -> upload; internal rows -> move into folder
    el.body.addEventListener("dragstart", (e) => {
      const row = e.target.closest(".row");
      if (!row || this.data?.readOnly) { e.preventDefault(); return; }
      if (!this.selection.has(row.dataset.name)) { this.selection = new Set([row.dataset.name]); this.refreshSelection(); }
      this.dragNames = [...this.selection];
      e.dataTransfer.effectAllowed = "copyMove";
      e.dataTransfer.setData("application/x-st-filemanager", JSON.stringify(this.dragNames));
    });
    el.body.addEventListener("dragend", () => { this.dragNames = null; this.clearDropTargets(); });
    const isFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
    const tbl = this.root.querySelector(".fm-table");
    tbl.addEventListener("dragenter", (e) => {
      if (isFiles(e) && !this.data?.readOnly) { this.dragDepth++; tbl.classList.add("dragging"); }
    });
    tbl.addEventListener("dragleave", (e) => {
      if (isFiles(e) && --this.dragDepth <= 0) { this.dragDepth = 0; tbl.classList.remove("dragging"); }
    });
    tbl.addEventListener("dragover", (e) => {
      if (this.data?.readOnly) return;
      if (isFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; return; }
      if (this.dragNames) {
        const row = e.target.closest(".row.is-dir");
        this.clearDropTargets();
        if (row && !this.dragNames.includes(row.dataset.name)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = e.ctrlKey ? "copy" : "move";
          row.classList.add("drop-target");
        }
      }
    });
    tbl.addEventListener("drop", (e) => {
      e.preventDefault();
      this.dragDepth = 0;
      tbl.classList.remove("dragging");
      this.clearDropTargets();
      if (this.data?.readOnly) return;
      if (isFiles(e)) {
        const items = [...(e.dataTransfer.items || [])];
        const dirs = items.filter((it) => it.webkitGetAsEntry?.()?.isDirectory).map((it) => it.getAsFile()?.name);
        dirs.forEach((n) => this.toast("error", this.t("uploadRejected", { name: n, reason: this.t("reasonDir") })));
        this.startUpload([...e.dataTransfer.files].filter((f) => !dirs.includes(f.name)));
      } else if (this.dragNames) {
        const row = e.target.closest(".row.is-dir");
        if (row && !this.dragNames.includes(row.dataset.name)) {
          this.send(e.ctrlKey ? "copy" : "move", { paths: this.dragNames.map((n) => joinPath(this.cwd, n)), dest: joinPath(this.cwd, row.dataset.name) });
        }
        this.dragNames = null;
      }
    });
    el.crumbs.addEventListener("dragover", (e) => {
      const c = e.target.closest("[data-path]");
      if (this.dragNames && c && c.dataset.path !== this.cwd) { e.preventDefault(); c.classList.add("drop-target"); }
    });
    el.crumbs.addEventListener("dragleave", (e) => e.target.closest("[data-path]")?.classList.remove("drop-target"));
    el.crumbs.addEventListener("drop", (e) => {
      const c = e.target.closest("[data-path]");
      if (!this.dragNames || !c) return;
      e.preventDefault();
      c.classList.remove("drop-target");
      this.send(e.ctrlKey ? "copy" : "move", { paths: this.dragNames.map((n) => joinPath(this.cwd, n)), dest: c.dataset.path });
      this.dragNames = null;
    });
  }

  destroy() {
    document.removeEventListener("mousedown", this.onDocDown, true);
    clearTimeout(this.busyTimer);
  }

  // -------------------------------------------------------------- update
  update(data, setTriggerValue) {
    this.trigger = setTriggerValue;
    const first = !this.data;
    const dirChanged = !first && data.cwd !== this.cwd;
    this.data = data;
    if (this.lang !== data.lang || this.messages !== data.i18n) {
      this.lang = data.lang;
      this.messages = data.i18n || {};
      try { this.plural = new Intl.PluralRules(this.lang); } catch { this.plural = new Intl.PluralRules("en"); }
      this.dateFmt = null;
      this.applyLabels();
    }
    this.cwd = data.cwd;
    this.entries = data.entries || [];
    this.root.style.height = data.height ? `${data.height}px` : "100%";
    this.root.classList.toggle("dark", this.isDark());
    this.root.classList.toggle("read-only", !!data.readOnly);
    this.el.ro.hidden = !data.readOnly;

    if (dirChanged) { this.selection.clear(); this.anchor = null; this.filter = ""; this.el.search.value = ""; }
    // drop selections that no longer exist
    const names = new Set(this.entries.map((e) => e.name));
    this.selection = new Set([...this.selection].filter((n) => names.has(n)));

    if (data.ack && data.ack === this.pendingId) this.setBusy(false);
    const flash = data.flash;
    if (flash && flash.id !== this.lastFlashId) {
      this.lastFlashId = flash.id;
      this.handleFlash(flash);
    }
    this.renderCrumbs();
    this.renderList();
    this.renderStatus();
  }

  handleFlash(f) {
    if (f.select) { this.selection = new Set(f.select); this.anchor = f.select[0]; this.scrollToSel = true; }
    if (f.notice) {
      const n = f.notice;
      this.toast(n.type, this.t(n.code, n.params || {}));
    }
    if (f.download) this.saveFile(f.download);
    if (f.preview) this.showPreview(f.preview);
  }

  isDark() {
    const bg = getComputedStyle(this.root).getPropertyValue("--st-background-color").trim();
    const m = bg.match(/^#([0-9a-f]{6})$/i);
    let rgb;
    if (m) rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    else {
      const mm = bg.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
      if (!mm) return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
      rgb = mm.slice(1, 4).map(Number);
    }
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] < 128;
  }

  applyLabels() {
    const tb = this.el.toolbar;
    for (const b of tb.querySelectorAll("button[data-act]")) {
      const label = this.t(b.dataset.act);
      b.title = label;
      b.setAttribute("aria-label", label);
      const span = b.querySelector("span");
      if (span) span.textContent = label;
    }
    this.el.search.placeholder = this.t("search");
    this.el.checkAll.title = this.t("selectAll");
    this.el.ro.querySelector("span").textContent = this.t("readOnly");
    this.root.querySelector(".fm-drop span").textContent = this.t("dropHere");
  }

  // ------------------------------------------------------------- render
  entry(name) { return this.entries.find((e) => e.name === name); }

  visible() {
    const { key, dir } = this.sort;
    const coll = new Intl.Collator(this.lang, { numeric: true, sensitivity: "base" });
    let list = this.entries;
    if (this.filter) list = list.filter((e) => e.name.toLowerCase().includes(this.filter));
    return [...list].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let c = 0;
      if (key === "size" && !a.is_dir) c = a.size - b.size;
      else if (key === "mtime") c = a.mtime - b.mtime;
      if (c === 0) c = coll.compare(a.name, b.name);
      return c * dir;
    });
  }

  renderCrumbs() {
    const parts = this.cwd ? this.cwd.split("/") : [];
    let html = `<button class="crumb" data-path="" title="${esc(this.data.rootName)}">${icon("home")}<span>${esc(this.data.rootName)}</span></button>`;
    let acc = "";
    parts.forEach((p, i) => {
      acc = joinPath(acc, p);
      html += `${icon("chevron", "chev")}<button class="crumb${i === parts.length - 1 ? " current" : ""}" data-path="${esc(acc)}">${esc(p)}</button>`;
    });
    this.el.crumbs.innerHTML = html;
    this.el.crumbs.scrollLeft = this.el.crumbs.scrollWidth;
  }

  kindOf(e) { return e.is_dir ? "folder" : EXT_KIND[e.ext] || "file"; }

  renderList() {
    const vis = this.visible();
    this.visibleCache = vis;
    const cut = this.clipboard?.mode === "cut" && this.clipboard.dir === this.cwd ? new Set(this.clipboard.names) : null;
    const ro = this.data?.readOnly;
    const rows = vis.map((e) => {
      const sel = this.selection.has(e.name);
      const kind = this.kindOf(e);
      return `<div class="row${sel ? " selected" : ""}${e.is_dir ? " is-dir" : ""}${cut?.has(e.name) ? " is-cut" : ""}${this.focusName === e.name ? " focused" : ""}"
        role="row" aria-selected="${sel}" data-name="${esc(e.name)}" draggable="${!ro}">
        <span class="c-check"><input type="checkbox" tabindex="-1" ${sel ? "checked" : ""}></span>
        <span class="c-name"><span class="k k-${kind}">${icon(kind)}</span><span class="nm" title="${esc(e.name)}">${esc(e.name)}</span></span>
        <span class="c-size">${e.is_dir ? "" : this.fmtSize(e.size)}</span>
        <span class="c-date">${this.fmtDate(e.mtime)}</span>
      </div>`;
    });
    this.el.body.innerHTML = rows.length
      ? rows.join("")
      : `<div class="empty">${icon(this.filter ? "search" : "folder")}<span>${this.t(this.filter ? "noMatch" : "emptyDir")}</span></div>`;

    for (const h of this.el.head.querySelectorAll("[data-sort]")) {
      const k = h.dataset.sort;
      const label = this.t(k === "mtime" ? "modified" : k);
      const active = this.sort.key === k;
      h.innerHTML = `${label}<span class="arrow">${active ? (this.sort.dir > 0 ? "▲" : "▼") : ""}</span>`;
      h.classList.toggle("active", active);
      h.setAttribute("aria-sort", active ? (this.sort.dir > 0 ? "ascending" : "descending") : "none");
    }
    const nSel = vis.filter((e) => this.selection.has(e.name)).length;
    this.el.checkAll.checked = vis.length > 0 && nSel === vis.length;
    this.el.checkAll.indeterminate = nSel > 0 && nSel < vis.length;

    if (this.scrollToSel) {
      this.scrollToSel = false;
      this.el.body.querySelector(".row.selected")?.scrollIntoView({ block: "nearest" });
    }
    this.updateToolbar();
    this.renderStatus();
  }

  // Update selection state in place: re-creating rows would break dblclick.
  refreshSelection() {
    const vis = this.visibleCache || [];
    for (const row of this.el.body.querySelectorAll(".row")) {
      const name = row.dataset.name;
      const sel = this.selection.has(name);
      row.classList.toggle("selected", sel);
      row.classList.toggle("focused", this.focusName === name);
      row.setAttribute("aria-selected", sel);
      row.querySelector(".c-check input").checked = sel;
    }
    const nSel = vis.filter((e) => this.selection.has(e.name)).length;
    this.el.checkAll.checked = vis.length > 0 && nSel === vis.length;
    this.el.checkAll.indeterminate = nSel > 0 && nSel < vis.length;
    this.updateToolbar();
    this.renderStatus();
  }

  updateToolbar() {
    const n = this.selection.size;
    const ro = !!this.data?.readOnly;
    const set = (act, enabled, hidden = false) => {
      const b = this.el.toolbar.querySelector(`[data-act="${act}"]`);
      b.disabled = !enabled || this.busy;
      b.hidden = hidden;
    };
    set("up", !!this.cwd);
    set("newFolder", true, ro);
    set("upload", true, ro);
    set("download", n > 0);
    set("rename", n === 1, ro);
    set("cut", n > 0, ro);
    set("copy", n > 0, ro);
    set("paste", !!this.clipboard, ro);
    set("delete", n > 0, ro);
    set("refresh", true);
    for (const s of this.el.toolbar.querySelectorAll(".sep.w")) s.hidden = ro;
  }

  renderStatus() {
    if (!this.data) return;
    const sel = this.entries.filter((e) => this.selection.has(e.name));
    let txt = this.t("items", { n: this.entries.length });
    if (sel.length) txt += " · " + this.t("selected", { n: sel.length, size: sel.reduce((s, e) => s + (e.size || 0), 0) });
    this.el.count.innerHTML = txt;

    const clip = this.clipboard;
    this.el.clip.hidden = !clip;
    if (clip) this.el.clip.innerHTML = `${icon(clip.mode)}${this.t("clipboard", { n: clip.names.length })} <button class="link" data-clear>${this.t("clear")}</button>`;
    this.el.clip.querySelector("[data-clear]")?.addEventListener("click", () => { this.clipboard = null; this.renderList(); });

    const q = this.data.quota;
    this.el.quota.hidden = !q;
    if (q) {
      const pct = q.limit ? Math.min(100, (q.used / q.limit) * 100) : 0;
      const bar = this.el.quota.querySelector(".qbar span");
      bar.style.width = `${pct}%`;
      this.el.quota.classList.toggle("warn", pct >= 75 && pct < 90);
      this.el.quota.classList.toggle("full", pct >= 90);
      this.el.quota.querySelector(".qtext").innerHTML = this.t("quota", { used: q.used, limit: q.limit });
      this.el.quota.title = `${pct.toFixed(1)} %`;
    }
  }

  // ---------------------------------------------------------- selection
  toggle(name) { this.selection.has(name) ? this.selection.delete(name) : this.selection.add(name); }

  clickSelect(name, e) {
    if (e.shiftKey && this.anchor) {
      const names = this.visibleCache.map((x) => x.name);
      const [a, b] = [names.indexOf(this.anchor), names.indexOf(name)].sort((x, y) => x - y);
      if (a >= 0) {
        if (!(e.ctrlKey || e.metaKey)) this.selection.clear();
        names.slice(a, b + 1).forEach((n) => this.selection.add(n));
      }
    } else if (e.ctrlKey || e.metaKey) {
      this.toggle(name);
      this.anchor = name;
    } else {
      this.selection = new Set([name]);
      this.anchor = name;
    }
    this.focusName = name;
    this.refreshSelection();
  }

  moveFocus(delta, extend) {
    const names = (this.visibleCache || []).map((x) => x.name);
    if (!names.length) return;
    let i = names.indexOf(this.focusName);
    i = i < 0 ? (delta > 0 ? 0 : names.length - 1) : Math.max(0, Math.min(names.length - 1, i + delta));
    const name = names[i];
    this.clickSelect(name, { shiftKey: extend, ctrlKey: false, metaKey: false });
    this.el.body.querySelector(".row.focused")?.scrollIntoView({ block: "nearest" });
  }

  selectedPaths() { return [...this.selection].map((n) => joinPath(this.cwd, n)); }

  // ------------------------------------------------------------ actions
  send(op, payload = {}) {
    if (this.busy || !this.trigger) return;
    const id = `${Date.now().toString(36)}-${++this.seq}`;
    this.pendingId = id;
    this.setBusy(true);
    this.trigger("action", { id, op, ...payload });
  }

  setBusy(on) {
    this.busy = on;
    clearTimeout(this.busyTimer);
    this.el.busy.hidden = true;
    if (on) {
      // show spinner only for slow operations; never lock the UI forever
      this.busyTimer = setTimeout(() => { this.el.busy.hidden = false; this.busyTimer = setTimeout(() => this.setBusy(false), 60000); }, 250);
    }
    this.updateToolbar();
  }

  cd(path) { if (path !== this.cwd) this.send("cd", { path }); }

  openEntry(e) {
    if (!e) return;
    if (e.is_dir) this.cd(joinPath(this.cwd, e.name));
    else if (PREVIEWABLE.has(this.kindOf(e)) || !EXT_KIND[e.ext]) this.send("preview", { path: joinPath(this.cwd, e.name) });
    else this.send("download", { paths: [joinPath(this.cwd, e.name)] });
  }

  command(act) {
    const ro = this.data?.readOnly;
    const writeOps = ["newFolder", "upload", "rename", "cut", "copy", "paste", "delete"];
    if (ro && writeOps.includes(act)) return;
    const n = this.selection.size;
    switch (act) {
      case "up": if (this.cwd) this.cd(this.cwd.split("/").slice(0, -1).join("/")); break;
      case "refresh": this.send("refresh"); break;
      case "newFolder":
        this.prompt(this.t("newFolder"), this.t("folderName"), "", this.t("create"), (name) => this.send("mkdir", { name }));
        break;
      case "upload": this.el.file.click(); break;
      case "download": if (n) this.send("download", { paths: this.selectedPaths() }); break;
      case "open": case "preview": if (n === 1) this.openEntry(this.entry([...this.selection][0])); break;
      case "rename": {
        if (n !== 1) break;
        const old = [...this.selection][0];
        this.prompt(this.t("rename"), this.t("newName"), old, this.t("ok"), (name) => {
          if (name !== old) this.send("rename", { path: joinPath(this.cwd, old), name });
        });
        break;
      }
      case "cut": case "copy":
        if (n) { this.clipboard = { mode: act, dir: this.cwd, names: [...this.selection] }; this.renderList(); }
        break;
      case "paste": {
        const c = this.clipboard;
        if (!c) break;
        const paths = c.names.map((x) => joinPath(c.dir, x));
        if (c.mode === "cut") { if (c.dir !== this.cwd) this.send("move", { paths, dest: this.cwd }); this.clipboard = null; }
        else this.send("copy", { paths, dest: this.cwd });
        break;
      }
      case "delete": {
        if (!n) break;
        const names = [...this.selection];
        this.confirm(this.t("confirmDeleteTitle"),
          `<p>${this.t("confirmDelete", { n: names.length, name: names[0] })}</p><p class="muted">${this.t("confirmDeleteNote")}</p>`,
          [{ label: this.t("cancel") }, { label: this.t("delete"), cls: "danger", primary: true, run: () => {
            if (this.clipboard?.dir === this.cwd) {
              this.clipboard.names = this.clipboard.names.filter((x) => !names.includes(x));
              if (!this.clipboard.names.length) this.clipboard = null;
            }
            this.send("delete", { paths: this.selectedPaths() });
          } }]);
        break;
      }
      case "selectAll": this.selection = new Set(this.visible().map((e) => e.name)); this.refreshSelection(); break;
    }
  }

  onKey(e) {
    if (!this.el.modal.hidden) return; // modal handles its own keys
    const inInput = e.target.closest?.("input, textarea") && !e.target.matches(".c-check input, .check-all");
    if (inInput) return;
    const mod = e.ctrlKey || e.metaKey;
    const handled = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === "ArrowDown") { handled(); this.moveFocus(1, e.shiftKey); }
    else if (e.key === "ArrowUp") { handled(); this.moveFocus(-1, e.shiftKey); }
    else if (e.key === "Enter" && this.selection.size === 1) { handled(); this.command("open"); }
    else if (e.key === "Backspace" || (e.altKey && e.key === "ArrowLeft")) { handled(); this.command("up"); }
    else if (e.key === "Delete") { handled(); this.command("delete"); }
    else if (e.key === "F2") { handled(); this.command("rename"); }
    else if (e.key === "F5") { handled(); this.command("refresh"); }
    else if (mod && e.key.toLowerCase() === "a") { handled(); this.command("selectAll"); }
    else if (mod && e.key.toLowerCase() === "c") { handled(); this.command("copy"); }
    else if (mod && e.key.toLowerCase() === "x") { handled(); this.command("cut"); }
    else if (mod && e.key.toLowerCase() === "v") { handled(); this.command("paste"); }
    else if (mod && e.key.toLowerCase() === "f") { handled(); this.el.search.focus(); }
    else if (e.key === "Escape" && (this.selection.size || !this.el.menu.hidden)) {
      handled(); this.hideMenu(); this.selection.clear(); this.refreshSelection();
    }
  }

  // -------------------------------------------------------------- menu
  showMenu(x, y, onItem) {
    const ro = this.data?.readOnly;
    const n = this.selection.size;
    const sel = n === 1 ? this.entry([...this.selection][0]) : null;
    const items = [];
    if (onItem) {
      if (sel) items.push(sel.is_dir ? ["open", "folder"] : ["preview", "eye"]);
      items.push(["download", "download"]);
      if (!ro) {
        items.push("-");
        if (n === 1) items.push(["rename", "rename"]);
        items.push(["cut", "cut"], ["copy", "copy"]);
        if (this.clipboard) items.push(["paste", "paste"]);
        items.push("-", ["delete", "delete", "danger"]);
      }
    } else {
      if (!ro) items.push(["newFolder", "newFolder"], ["upload", "upload"]);
      if (!ro && this.clipboard) items.push(["paste", "paste"]);
      if (items.length) items.push("-");
      items.push(["selectAll", "copy"], ["refresh", "refresh"]);
    }
    this.el.menu.innerHTML = items.map((it) => it === "-" ? '<hr>'
      : `<button role="menuitem" data-act="${it[0]}" class="${it[2] || ""}">${icon(it[1])}<span>${this.t(it[0])}</span></button>`).join("");
    this.el.menu.hidden = false;
    const host = this.root.getBoundingClientRect();
    const m = this.el.menu.getBoundingClientRect();
    const left = Math.min(x - host.left, host.width - m.width - 4);
    const top = y - host.top + m.height > host.height ? Math.max(4, y - host.top - m.height) : y - host.top;
    this.el.menu.style.left = `${Math.max(4, left)}px`;
    this.el.menu.style.top = `${top}px`;
  }
  hideMenu() { this.el.menu.hidden = true; }
  clearDropTargets() { this.root.querySelectorAll(".drop-target").forEach((x) => x.classList.remove("drop-target")); }

  // ------------------------------------------------------------- modals
  openModal(html, { wide = false, onKey } = {}) {
    const layer = this.el.modal;
    layer.innerHTML = `<div class="modal${wide ? " wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    layer.hidden = false;
    const modal = layer.firstElementChild;
    const close = () => { layer.hidden = true; layer.innerHTML = ""; this.el.body.focus({ preventScroll: true }); };
    layer.onmousedown = (e) => { if (e.target === layer) close(); };
    modal.onkeydown = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
      onKey?.(e, close);
      e.stopPropagation();
    };
    modal.querySelector("[data-close]")?.addEventListener("click", close);
    return { modal, close };
  }

  confirm(title, bodyHtml, buttons) {
    const { modal, close } = this.openModal(`
      <h3>${esc(title)}</h3><div class="modal-body">${bodyHtml}</div>
      <div class="modal-actions">${buttons.map((b, i) => `<button class="btn ${b.primary ? "primary" : ""} ${b.cls || ""}" data-i="${i}">${esc(b.label)}</button>`).join("")}</div>`);
    modal.querySelectorAll("[data-i]").forEach((el) => el.addEventListener("click", () => { close(); buttons[+el.dataset.i].run?.(); }));
    const primary = modal.querySelector(".btn.primary") || modal.querySelector(".btn");
    primary?.focus();
  }

  prompt(title, label, value, okLabel, onOk) {
    const { modal, close } = this.openModal(`
      <h3>${esc(title)}</h3>
      <label class="field"><span>${esc(label)}</span><input type="text" spellcheck="false" value="${esc(value)}"></label>
      <p class="field-error" hidden></p>
      <div class="modal-actions"><button class="btn" data-close>${this.t("cancel")}</button><button class="btn primary" data-ok>${esc(okLabel)}</button></div>`,
      { onKey: (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } } });
    const input = modal.querySelector("input");
    const err = modal.querySelector(".field-error");
    const submit = () => {
      const v = input.value.trim();
      if (!v || v === "." || v === ".." || /[\/\\\0]/.test(v)) {
        err.hidden = false; err.innerHTML = this.t("invalid_name", { name: v }); input.focus(); return;
      }
      close();
      onOk(v);
    };
    modal.querySelector("[data-ok]").addEventListener("click", submit);
    input.focus();
    const dot = value.lastIndexOf(".");
    input.setSelectionRange(0, dot > 0 ? dot : value.length);
  }

  async showPreview(p) {
    const meta = `<span class="muted">${this.fmtSize(p.size)}</span>`;
    const head = `<div class="pv-head">${icon(p.kind === "image" ? "image" : "code")}<h3 title="${esc(p.name)}">${esc(p.name)}</h3>${meta}
      <span class="grow"></span>
      <button class="btn icon-only" data-dl title="${this.t("download")}">${icon("download")}</button>
      <button class="btn icon-only" data-close title="${this.t("close")}">${icon("close")}</button></div>`;
    let body;
    if (p.kind === "image") body = `<div class="pv-image"><img alt="${esc(p.name)}" src="${p.src}"></div>`;
    else body = `${p.truncated ? `<p class="pv-note">${this.t("truncated")}</p>` : ""}<pre class="pv-text"><code class="hljs">${esc(p.text)}</code></pre>`;
    const path = joinPath(this.cwd, p.name);
    const { modal } = this.openModal(head + body, { wide: true });
    modal.querySelector("[data-dl]").addEventListener("click", () => this.send("download", { paths: [path] }));
    modal.querySelector("[data-close]").focus();
    if (p.kind === "text" && p.lang !== "plaintext" && p.text.length <= HIGHLIGHT_LIMIT) {
      try {
        const hljs = (this.constructor.hljs ??= (await import(HLJS_URL)).default);
        const code = modal.querySelector("code");
        if (!code?.isConnected) return;
        const res = hljs.getLanguage(p.lang) ? hljs.highlight(p.text, { language: p.lang, ignoreIllegals: true }) : hljs.highlightAuto(p.text);
        code.innerHTML = res.value;
      } catch (err) { /* offline / CDN blocked: keep plain text */ }
    }
  }

  // ------------------------------------------------------------ transfer
  saveFile(dl) {
    const bin = atob(dl.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: dl.mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = dl.name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  startUpload(files) {
    if (!files.length || this.data?.readOnly) return;
    const d = this.data;
    const ok = [];
    let free = d.quota ? d.quota.limit - d.quota.used : Infinity;
    for (const f of files) {
      const ext = f.name.includes(".") ? f.name.split(".").pop().toLowerCase() : "";
      let reason = null;
      if (d.allowedExt && !d.allowedExt.includes(ext)) reason = this.t("reasonExt");
      else if (d.maxUpload && f.size > d.maxUpload) reason = this.t("reasonSize", { max: d.maxUpload });
      else if (f.size > free) reason = this.t("reasonQuota", { free: Math.max(0, free) });
      if (reason) { this.toast("error", this.t("uploadRejected", { name: f.name, reason })); continue; }
      free -= f.size;
      ok.push(f);
    }
    if (!ok.length) return;
    const existing = new Set(this.entries.map((e) => e.name));
    const clashes = ok.filter((f) => existing.has(f.name));
    const go = (overwrite) => this.uploadFiles(ok, overwrite);
    if (!clashes.length) return go(false);
    const shown = clashes.slice(0, 5).map((f) => this.t("quote", { name: f.name })).join(", ") + (clashes.length > 5 ? " …" : "");
    const dirClash = clashes.some((f) => this.entry(f.name)?.is_dir);
    this.confirm(this.t("conflictTitle"), `<p>${this.t("conflictText", { names: shown })}</p>`, [
      { label: this.t("cancel") },
      ...(dirClash ? [] : [{ label: this.t("overwrite"), cls: "danger", run: () => go(true) }]),
      { label: this.t("keepBoth"), primary: true, run: () => go(false) },
    ]);
  }

  async uploadFiles(files, overwrite) {
    const read = (f) => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res({ name: f.name, b64: String(r.result).split(",", 2)[1] || "" });
      r.onerror = () => rej(r.error);
      r.readAsDataURL(f);
    });
    this.setBusy(true);
    try {
      const payload = await Promise.all(files.map(read));
      this.busy = false;
      this.send("upload", { files: payload, dir: this.cwd, overwrite });
    } catch (err) {
      this.setBusy(false);
      this.toast("error", this.t("upload_failed", { name: files[0]?.name }));
    }
  }

  // --------------------------------------------------------------- toast
  toast(type, html) {
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${html}</span><button class="x" aria-label="${this.t("close")}">${icon("close")}</button>`;
    t.querySelector(".x").onclick = () => t.remove();
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => t.classList.add("out"), type === "error" ? 6000 : 3000);
    setTimeout(() => t.remove(), type === "error" ? 6400 : 3400);
  }
}

export default function (component) {
  const { data, parentElement, setTriggerValue } = component;
  let app = parentElement.__stFileManager;
  if (!app || !app.root.isConnected) {
    app?.destroy();
    app = new FileManagerApp(parentElement);
    parentElement.__stFileManager = app;
  }
  app.update(data || {}, setTriggerValue);
  // Streamlit only runs the cleanup returned by the latest call, on unmount.
  return () => {
    app.destroy();
    if (parentElement.__stFileManager === app) delete parentElement.__stFileManager;
  };
}
