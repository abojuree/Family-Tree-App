// csv_loader_generic.js
// قراءة أي CSV يحدده المستخدم + واجهة اختيار الأعمدة (ID / Parent / Name)

function smartSplitCSVLine(line) {
  // يدعم الفواصل داخل علامات اقتباس
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // "" داخل الاقتباس
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };

  const headers = smartSplitCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, "").trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = smartSplitCSVLine(lines[i]).map(c => c.replace(/^"|"$/g, "").trim());
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = cols[idx] ?? ""));
    rows.push(obj);
  }

  return { headers, rows };
}

function buildStats(data) {
  const children = new Map();
  const parentOf = new Map();

  data.forEach(d => {
    parentOf.set(d.id, d.f ?? null);
    if (d.f != null) {
      if (!children.has(d.f)) children.set(d.f, []);
      children.get(d.f).push(d.id);
    }
  });

  // roots
  const roots = data.filter(d => d.f == null).map(d => d.id);

  // depth
  const depthMemo = new Map();
  function depth(id) {
    if (depthMemo.has(id)) return depthMemo.get(id);
    const p = parentOf.get(id);
    const v = (p == null) ? 0 : (1 + depth(p));
    depthMemo.set(id, v);
    return v;
  }

  // subtree size
  const subMemo = new Map();
  function subtreeSize(id) {
    if (subMemo.has(id)) return subMemo.get(id);
    const kids = children.get(id) || [];
    if (!kids.length) { subMemo.set(id, 1); return 1; }
    let sum = 0;
    for (const k of kids) sum += subtreeSize(k);
    subMemo.set(id, sum);
    return sum;
  }

  let maxChildren = 0;
  let maxDepth = 0;
  for (const d of data) {
    const kids = (children.get(d.id) || []).length;
    if (kids > maxChildren) maxChildren = kids;
    const dep = depth(d.id);
    if (dep > maxDepth) maxDepth = dep;
  }

  return { total: data.length, roots, maxChildren, maxDepth, childrenMap: children, depthOf: depth, subtreeOf: subtreeSize };
}

// ---- UI wiring ----

function el(id) { return document.getElementById(id); }

function fillSelect(selectEl, headers) {
  selectEl.innerHTML = "";
  headers.forEach(h => {
    const opt = document.createElement("option");
    opt.value = h;
    opt.textContent = h;
    selectEl.appendChild(opt);
  });
}

function guessColumn(headers, candidates) {
  const low = headers.map(h => h.toLowerCase());
  for (const c of candidates) {
    const idx = low.indexOf(c.toLowerCase());
    if (idx >= 0) return headers[idx];
  }
  return headers[0] ?? "";
}

function normalizeRows(rows, idCol, parentCol, nameCol) {
  const data = [];
  for (const r of rows) {
    const rawId = r[idCol];
    if (rawId == null || rawId === "") continue;

    const rawParent = r[parentCol];
    const id = String(rawId).trim();
    const f = (rawParent == null || String(rawParent).trim() === "") ? null : String(rawParent).trim();
    // استخدم دومًا عمود "الاسم" للعرض إذا كان موجودًا
    const n = (r["الاسم"] == null || String(r["الاسم"]).trim() === "") ? id : String(r["الاسم"]).trim();

    data.push({ id, f, n });
  }
  return data;
}

// هذه الدالة تناديها بعد ما تحمل CSV
function attachGenericCSVLoader() {
  const fileInput = el("csvFile");
  const idSel = el("colId");
  const parentSel = el("colParent");
  const nameSel = el("colName");
  const applyBtn = el("applyCols");
  const status = el("csvStatus");

  let parsed = null;

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const text = await file.text();
    parsed = parseCSV(text);

    if (!parsed.headers.length) {
      status.textContent = "الملف فاضي أو غير صالح.";
      return;
    }

    fillSelect(idSel, parsed.headers);
    fillSelect(parentSel, parsed.headers);
    fillSelect(nameSel, parsed.headers);

    // تخمين ذكي للأعمدة
    idSel.value = guessColumn(parsed.headers, ["id", "ID", "رقم", "الرقم", "code", "uuid"]);
    parentSel.value = guessColumn(parsed.headers, ["parent", "parentid", "father", "fatherid", "رقم الأب", "الأب", "pid"]);
    nameSel.value = guessColumn(parsed.headers, ["name", "اسم", "الاسم", "full name", "الاسم الكامل", "title"]);

    status.textContent = `تم تحميل CSV: ${file.name} | الأعمدة: ${parsed.headers.length} | الصفوف: ${parsed.rows.length}`;
  });

  applyBtn.addEventListener("click", () => {
    if (!parsed) { status.textContent = "اختر ملف CSV أولاً."; return; }

    const idCol = idSel.value;
    const parentCol = parentSel.value;
    const nameCol = nameSel.value;

    const data = normalizeRows(parsed.rows, idCol, parentCol, nameCol);

    window.DATA = data;
        console.log("[CSV] window.DATA بعد الاستيراد:", window.DATA);
      console.log("DATA بعد الاستيراد:", window.DATA);
      console.log("الجذر المتوقع:", window.DATA.find(d => !d.f));
    window.TREE_STATS = buildStats(data);

    status.textContent = `جاهز للرسم ✅ | أفراد: ${TREE_STATS.total} | جذور: ${TREE_STATS.roots.length} | عمق: ${TREE_STATS.maxDepth}`;

    // هنا نطلب من الشجرة تعيد البناء (لازم تكون عندك دالة rebuild في app.js أو tree.js)
    if (typeof window.rebuildTree === "function") window.rebuildTree();
  });
}
