const TESTS = [
  { id: "labeling_packaging", name: "Labeling and Packaging", kind: "qualitative", fields: [{ id: "pass", label: "Result", type: "passfail" }, { id: "reason", label: "Reasoning", type: "text" }] },
  { id: "weight_volume", name: "Weight and Volume", kind: "weightVolume", max: 10, fields: [{ id: "tare", label: "Tare weight", type: "number" }, { id: "gross", label: "Gross weight", type: "number" }, { id: "net", label: "Net weight", type: "number" }, { id: "density", label: "Specific gravity", type: "number" }] },
  { id: "vacuum", name: "Vacuum", unit: "mmHg", fields: [{ id: "hg", label: "Vacuum (inHg)", type: "number" }], calc: r => num(r.hg) * 25.4 },
  { id: "drained_weight", name: "Drained Weight", unit: "g", fields: [{ id: "value", label: "Drained weight", type: "number" }], calc: r => num(r.value) },
  { id: "ph", name: "pH", unit: "pH", fields: [{ id: "value", label: "pH", type: "number", min: 0, max: 14 }], calc: r => inRange(num(r.value), 0, 14) ? num(r.value) : NaN },
  { id: "moisture_device", name: "Moisture (Drying Device)", unit: "%", fields: [{ id: "value", label: "Moisture", type: "number" }], calc: r => num(r.value) },
  { id: "moisture_oven", name: "Moisture (Drying Oven)", unit: "%", fields: [{ id: "sample", label: "Sample mass", type: "number" }, { id: "crucible", label: "Crucible mass", type: "number" }, { id: "end", label: "End mass", type: "number" }], calc: r => ((num(r.sample) + num(r.crucible) - num(r.end)) / num(r.sample)) * 100 },
  { id: "brix", name: "Soluble Solids (Brix)", unit: "Brix", single: true, fields: [{ id: "value", label: "Brix", type: "number" }], calc: r => num(r.value) },
  { id: "acidity", name: "Acidity", unit: "%", fields: [{ id: "volume", label: "Titration volume", type: "number" }, { id: "mass", label: "Sample mass", type: "number" }, { id: "acid", label: "Acid constant", type: "select", options: [["0.64", "Citric 0.64"], ["0.90", "Lactic 0.90"], ["0.60", "Acetic 0.60"], ["0.75", "Tartaric 0.75"], ["0.47", "Oleic 0.47"]] }], calc: r => (num(r.volume) * num(r.acid)) / num(r.mass) },
  { id: "ash", name: "Ash", unit: "%", fields: [{ id: "crucible", label: "Crucible mass", type: "number" }, { id: "sample", label: "Sample mass", type: "number" }, { id: "end", label: "Mass after burning", type: "number" }], calc: r => ((num(r.end) - num(r.crucible)) / num(r.sample)) * 100 },
  { id: "acid_insoluble_ash", name: "Acid-Insoluble Ash (HCl)", unit: "%", fields: [{ id: "crucible", label: "Crucible mass", type: "number" }, { id: "sample", label: "Sample mass", type: "number" }, { id: "end", label: "Mass after burning", type: "number" }], calc: r => ((num(r.end) - num(r.crucible)) / num(r.sample)) * 100 },
  { id: "sieving_size", name: "Sieving and Size", kind: "multiResult", fields: [{ id: "sample", label: "Sample mass", type: "number" }, { id: "passed", label: "Passed mass", type: "number" }, { id: "size", label: "Size", type: "number" }], calc: r => ({ "Passed %": (num(r.passed) / num(r.sample)) * 100, "Size avg": num(r.size) }) },
  { id: "salt", name: "Salt", unit: "%", fields: [{ id: "silver", label: "Silver nitrate volume", type: "number" }, { id: "mass", label: "Sample mass", type: "number" }], calc: r => (num(r.silver) * 0.585) / num(r.mass) },
  { id: "specific_gravity", name: "Specific Gravity", single: true, fields: [{ id: "value", label: "Specific gravity", type: "number" }], calc: r => num(r.value) },
  { id: "aqueous_layer", name: "Aqueous Layer Volume", kind: "aqueous", unit: "ml/100g", fields: [{ id: "volume", label: "Aqueous volume", type: "number" }, { id: "sample", label: "Sample mass", type: "number" }, { id: "selected", label: "Use in denominator", type: "checkbox" }] },
  { id: "organoleptic", name: "Organoleptic Evaluation", kind: "qualitative", fields: [{ id: "pass", label: "Result", type: "passfail" }, { id: "summary", label: "Summary reference", type: "text" }] },
  { id: "peroxides", name: "Peroxides in Oil", unit: "meq", fields: [{ id: "volume", label: "Thiosulfate volume", type: "number" }, { id: "mass", label: "Sample mass", type: "number" }], calc: r => (num(r.volume) * 10) / num(r.mass) },
  { id: "drip_loss", name: "Drip Loss in Fish (Ice %)", unit: "%", fields: [{ id: "before", label: "Mass before defrost", type: "number" }, { id: "after", label: "Mass after defrost", type: "number" }], calc: r => 100 - ((100 * num(r.after)) / num(r.before)) },
  { id: "water_activity", name: "Water Activity (Aw)", single: true, unit: "Aw", fields: [{ id: "value", label: "Water activity", type: "number" }], calc: r => num(r.value) },
  { id: "paprika_asta", name: "Paprika Color (ASTA)", unit: "ASTA", min: 2, max: 2, fields: [{ id: "mass", label: "Sample mass (mg)", type: "number" }, { id: "absorption", label: "Absorption value", type: "number" }], calc: r => (num(r.absorption) * 1640) / num(r.mass) },
  { id: "fat_separation", name: "Fat Separation", unit: "%", min: 2, max: 2, fields: [{ id: "fat", label: "Mass of fat", type: "number" }, { id: "total", label: "Total mass", type: "number" }], calc: r => (num(r.fat) * 100) / num(r.total) },
  { id: "oxygen_analyzer", name: "Oxygen Analyzer", single: true, unit: "%", fields: [{ id: "value", label: "Oxygen", type: "number" }], calc: r => num(r.value) },
  { id: "filling_coating", name: "Filling and Coating", kind: "multiResult", max: 10, fields: [{ id: "external", label: "External mass", type: "number" }, { id: "internal", label: "Internal mass", type: "number" }, { id: "total", label: "Total mass", type: "number" }], calc: r => ({ "Coating %": (num(r.external) / num(r.total)) * 100, "Filling %": (num(r.internal) / num(r.total)) * 100 }) },
  { id: "salt_auto", name: "Salt (Automatic Titrator)", single: true, unit: "%", fields: [{ id: "value", label: "Salt", type: "number" }], calc: r => num(r.value) },
  { id: "acidity_auto", name: "Acidity (Automatic Titrator)", single: true, unit: "%", fields: [{ id: "value", label: "Acidity", type: "number" }], calc: r => num(r.value) },
  { id: "tuna_chunk", name: "Chunk Percentage in Tuna", unit: "%", min: 5, fields: [{ id: "chunk", label: "Chunk mass", type: "number" }, { id: "total", label: "Total mass", type: "number" }], calc: r => (num(r.chunk) / num(r.total)) * 100 },
  { id: "foreign_matter", name: "Foreign Matter / Insects / Defects", kind: "qualitative", fields: [{ id: "pass", label: "Result", type: "passfail" }, { id: "reason", label: "Notes", type: "text" }] },
  { id: "general_ratio", name: "General Ratio Test", unit: "%", custom: true, fields: [{ id: "name", label: "Result name", type: "text" }, { id: "part", label: "Part", type: "number" }, { id: "whole", label: "Whole", type: "number" }], calc: r => (num(r.part) / num(r.whole)) * 100 }
];

const testMap = Object.fromEntries(TESTS.map(test => [test.id, test]));
const storeKey = "food-lims-v1";
const state = loadState();
migrateState();
let role = "technician";
let activeView = "dashboard";

function defaultState() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    templates: [
      {
        id: uid(),
        name: "Canned Tomato Sauce",
        packaging: "Shared canned tomato test program",
        incubation36: 7,
        incubation55: 3,
        tests: ["labeling_packaging", "weight_volume", "vacuum", "ph", "brix", "acidity", "salt", "organoleptic", "foreign_matter"],
        standards: {
          ph: { min: 3.8, max: 4.6 },
          brix: { min: 7, max: 12 },
          salt: { min: 0.4, max: 1.8 },
          vacuum: { min: 100, max: 300 }
        }
      }
    ],
    shipments: [],
    results: {},
    createdAt: today
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(storeKey);
    return raw ? JSON.parse(raw) : defaultState();
  } catch {
    return defaultState();
  }
}

function save() {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function migrateState() {
  state.shipments.forEach(shipment => {
    if (shipment.units36 === undefined) shipment.units36 = shipment.batches.reduce((sum, batch) => sum + Number(batch.units36 || 0), 0);
    if (shipment.units55 === undefined) shipment.units55 = shipment.batches.reduce((sum, batch) => sum + Number(batch.units55 || 0), 0);
    const template = templateFor(shipment.templateId);
    if (template) {
      if (shipment.exit36 === undefined) shipment.exit36 = Number(shipment.units36 || 0) && Number(template.incubation36 || 0) ? addDays(shipment.intakeDate, template.incubation36) : "";
      if (shipment.exit55 === undefined) shipment.exit55 = Number(shipment.units55 || 0) && Number(template.incubation55 || 0) ? addDays(shipment.intakeDate, template.incubation55) : "";
    }
    shipment.batches.forEach(batch => {
      if (!batch.productionDate) {
        const parsed = productionDateFromBatchNumber(batch.number);
        if (parsed.valid) batch.productionDate = parsed.iso;
      }
    });
  });
  save();
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function inRange(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function fmt(value, digits = 2) {
  return Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.?0+$/, "") : "-";
}

function avg(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return NaN;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date + "T00:00:00");
  next.setDate(next.getDate() + Number(days || 0));
  return next.toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return "-";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

function compareIso(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function productionDateFromBatchNumber(value) {
  const match = String(value || "").trim().match(/^(\d{2})-(\d{3})$/);
  if (!match) return { matched: false, valid: false, iso: "", message: "" };
  const year = 2000 + Number(match[1]);
  const dayOfYear = Number(match[2]);
  const maxDay = isLeapYear(year) ? 366 : 365;
  if (dayOfYear < 1 || dayOfYear > maxDay) {
    return { matched: true, valid: false, iso: "", message: `${match[0]} is not a valid production date code for ${year}.` };
  }
  const date = new Date(Date.UTC(year, 0, dayOfYear));
  return { matched: true, valid: true, iso: date.toISOString().slice(0, 10), message: `Production date detected: ${formatDate(date.toISOString().slice(0, 10))}` };
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function allBatches() {
  return state.shipments.flatMap(shipment => shipment.batches.map(batch => ({ ...batch, shipment })));
}

function resultKey(batchId, testId) {
  return `${batchId}:${testId}`;
}

function getRows(batchId, testId) {
  return state.results[resultKey(batchId, testId)] || [];
}

function setRows(batchId, testId, rows) {
  state.results[resultKey(batchId, testId)] = rows;
  save();
}

function templateFor(id) {
  return state.templates.find(template => template.id === id);
}

function batchStatus(batch) {
  if (batch.approvedAt) return "Approved";
  const template = templateFor(batch.shipment.templateId);
  const complete = template.tests.every(testId => calculationFor(batch.id, testId).complete);
  if (complete) return "Ready for review";
  if (batchHasAnyResult(batch)) return "Testing started";
  return "Pending tests";
}

function batchHasAnyResult(batch) {
  const template = templateFor(batch.shipment.templateId);
  return template?.tests.some(testId => getRows(batch.id, testId).length > 0) || false;
}

function batchIsComplete(batch) {
  const template = templateFor(batch.shipment.templateId);
  return template?.tests.every(testId => calculationFor(batch.id, testId).complete) || false;
}

function shipmentIncubation(shipment) {
  const template = templateFor(shipment.templateId);
  if (!template) return { required: false, due: false, targets: [], exited: false, status: "No incubation" };
  const needs36 = Number(shipment.units36 || 0) > 0 && Number(template.incubation36 || 0) > 0;
  const needs55 = Number(shipment.units55 || 0) > 0 && Number(template.incubation55 || 0) > 0;
  const targets = [
    needs36 ? { temp: "36C", units: Number(shipment.units36 || 0), date: shipment.exit36 || addDays(shipment.intakeDate, template.incubation36) } : null,
    needs55 ? { temp: "55C", units: Number(shipment.units55 || 0), date: shipment.exit55 || addDays(shipment.intakeDate, template.incubation55) } : null
  ].filter(Boolean);
  const required = targets.length > 0;
  const exited = Boolean(shipment.incubationExitedAt || shipment.incubationRemovedEarlyAt);
  const due = required && !exited && targets.some(target => compareIso(target.date, todayIso()) <= 0);
  const nextExit = targets.map(target => target.date).sort()[0] || "";
  return {
    required,
    due,
    exited,
    nextExit,
    targets,
    early: Boolean(shipment.incubationRemovedEarlyAt),
    status: !required ? "No incubation" : exited ? (shipment.incubationRemovedEarlyAt ? "Removed early" : "Exited incubation") : due ? "Incubation due" : "In incubation"
  };
}

function testingAllowed(shipment) {
  const incubation = shipmentIncubation(shipment);
  return !incubation.required || incubation.exited;
}

function shipmentProgress(shipment) {
  const batches = shipment.batches.map(batch => ({ ...batch, shipment }));
  return {
    total: batches.length,
    started: batches.filter(batchHasAnyResult).length,
    tested: batches.filter(batchIsComplete).length,
    approved: batches.filter(batch => batch.approvedAt).length
  };
}

function shipmentStatus(shipment) {
  const progress = shipmentProgress(shipment);
  const incubation = shipmentIncubation(shipment);
  if (incubation.required && !incubation.exited) return incubation.due ? "Incubation due" : "In incubation";
  if (!progress.total) return "Intake";
  if (progress.approved === progress.total) return "Complete";
  if (progress.tested === progress.total) return "Ready for review";
  if (progress.started > 0) return "Testing in progress";
  return "Pending tests";
}

function calculationFor(batchId, testId) {
  const test = testMap[testId];
  const rows = getRows(batchId, testId);
  if (!test) return { label: "-", average: NaN, complete: false, values: [] };
  if (test.kind === "qualitative") {
    const last = rows[rows.length - 1] || {};
    return { label: last.pass || "-", average: NaN, complete: last.pass === "Pass" || last.pass === "Fail", values: [], note: last.reason || last.summary || "" };
  }
  if (test.kind === "weightVolume") {
    const nets = rows.map(row => Number.isFinite(num(row.net)) ? num(row.net) : num(row.gross) - num(row.tare)).filter(Number.isFinite);
    const density = rows.map(row => num(row.density)).find(Number.isFinite);
    const volumes = Number.isFinite(density) ? nets.map(net => net / density) : [];
    return { label: `Net ${fmt(avg(nets))} g / Volume ${fmt(avg(volumes))} ml`, average: avg(nets), extraAverage: avg(volumes), complete: nets.length > 0, values: nets };
  }
  if (test.kind === "aqueous") {
    const selectedMass = rows.filter(row => row.selected).reduce((sum, row) => sum + (num(row.sample) || 0), 0);
    const volume = rows.map(row => num(row.volume)).find(Number.isFinite);
    const value = selectedMass > 0 ? (volume / selectedMass) * 100 : NaN;
    return { label: `${fmt(value)} ${test.unit}`, average: value, complete: Number.isFinite(value), values: [value] };
  }
  if (test.kind === "multiResult") {
    const buckets = {};
    rows.forEach(row => {
      const result = test.calc(row);
      Object.entries(result).forEach(([name, value]) => {
        if (!buckets[name]) buckets[name] = [];
        buckets[name].push(value);
      });
    });
    const labels = Object.entries(buckets).map(([name, values]) => `${name}: ${fmt(avg(values))}`);
    const valueCount = Object.values(buckets)[0]?.filter(Number.isFinite).length || 0;
    return { label: labels.join(" / ") || "-", average: avg(Object.values(buckets).map(avg)), complete: labels.length > 0 && valueCount >= (test.min || 1), values: Object.values(buckets).flat() };
  }
  const values = rows.map(row => test.calc(row)).filter(Number.isFinite);
  const labelName = test.custom && rows[0]?.name ? rows[0].name : test.name;
  const requiredRows = test.min || 1;
  return { label: values.length ? `${labelName}: ${fmt(avg(values))}${test.unit ? " " + test.unit : ""}` : "-", average: avg(values), complete: values.length >= requiredRows, values };
}

function withinStandard(template, testId, calc) {
  const standard = template.standards[testId];
  if (!standard || !Number.isFinite(calc.average)) return true;
  if (standard.min !== "" && standard.min !== undefined && Number.isFinite(num(standard.min)) && calc.average < num(standard.min)) return false;
  if (standard.max !== "" && standard.max !== undefined && Number.isFinite(num(standard.max)) && calc.average > num(standard.max)) return false;
  return true;
}

function render() {
  document.querySelectorAll(".role-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.role === role));
  document.querySelectorAll(".manager-only").forEach(el => el.classList.toggle("hidden", role !== "manager"));
  if (role !== "manager" && ["templates", "review", "coa"].includes(activeView)) activeView = "dashboard";
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === activeView));
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === activeView));
  renderDashboard();
  renderIntake();
  renderTesting();
  renderTemplates();
  renderReview();
  renderCoa();
}

function renderDashboard() {
  const batches = allBatches();
  const pending = batches.filter(batch => testingAllowed(batch.shipment) && ["Pending tests", "Testing started"].includes(batchStatus(batch)));
  const dueShipments = state.shipments.filter(shipment => shipmentIncubation(shipment).due);
  const ready = batches.filter(batch => batchStatus(batch) === "Ready for review");
  document.querySelector("#dashboard").innerHTML = `
    <div class="grid three">
      <div class="panel metric"><span class="muted">Pending tests</span><strong>${pending.length}</strong></div>
      <div class="panel metric"><span class="muted">Incubation attention</span><strong>${dueShipments.length}</strong></div>
      <div class="panel metric"><span class="muted">Ready for manager review</span><strong>${ready.length}</strong></div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="panel"><h2>Pending Tests</h2><div class="list">${pending.map(batchCard).join("") || empty("No pending tests.")}</div></div>
      <div class="panel"><h2>Incubation Due</h2><div class="list">${dueShipments.map(shipmentAlertCard).join("") || empty("No shipments need incubation attention.")}</div></div>
    </div>
  `;
}

function batchCard(batch) {
  const template = templateFor(batch.shipment.templateId);
  return `
    <div class="card">
      <div class="row">
        <div>
          <strong>${escapeHtml(batch.number)}</strong>
          <div class="muted">${escapeHtml(template?.name || "Unknown product")} / ${escapeHtml(batch.shipment.supplier)}</div>
        </div>
        <span class="pill">${batchStatus(batch)}</span>
      </div>
      <div class="muted">Shipment status: ${shipmentStatus(batch.shipment)}</div>
    </div>
  `;
}

function shipmentAlertCard(shipment) {
  const template = templateFor(shipment.templateId);
  const incubation = shipmentIncubation(shipment);
  return `
    <div class="card alert-card">
      <div class="row">
        <div>
          <strong>${escapeHtml(template?.name || "Unknown product")}</strong>
          <div class="muted">${escapeHtml(shipment.supplier)} / arrived ${shipment.intakeDate}</div>
        </div>
        <span class="pill bad">Incubation due</span>
      </div>
      <p class="alert-text">This shipment reached its incubation target on ${incubation.targets.map(target => `${target.temp} ${formatDate(target.date)}`).join(" / ")}.</p>
      <div class="button-row">
        <button class="ok" data-action="mark-incubation-exited" data-id="${shipment.id}">Mark exited incubation</button>
      </div>
    </div>
  `;
}

function renderIntake() {
  document.querySelector("#intake").innerHTML = `
    <div class="toolbar">
      <h2>Shipment Intake</h2>
      <button class="btn" data-action="new-shipment">+ Shipment</button>
    </div>
    <div class="shipment-list">${state.shipments.map(shipmentPanel).join("") || `<div class="panel">${empty("No shipments yet.")}</div>`}</div>
  `;
}

function shipmentPanel(shipment) {
  const template = templateFor(shipment.templateId);
  const progress = shipmentProgress(shipment);
  const incubation = shipmentIncubation(shipment);
  const status = shipmentStatus(shipment);
  return `
    <details class="shipment-panel" ${incubation.due ? "open" : ""}>
      <summary>
        <div class="shipment-summary">
          <div>
            <strong>${escapeHtml(template?.name || "Unknown product")}</strong>
            <div class="muted">${escapeHtml(shipment.supplier)} / ${shipment.intakeDate} / ${escapeHtml(shipment.size || "No size recorded")}</div>
          </div>
          <div class="summary-metrics">
            <span class="pill ${status === "Complete" ? "good" : incubation.due ? "bad" : "warn"}">${status}</span>
            <span class="pill">${progress.total} batches</span>
            <span class="pill">Tested ${progress.tested}/${progress.total}</span>
            <span class="pill">COA ${progress.approved}/${progress.total}</span>
          </div>
        </div>
      </summary>
      <div class="shipment-body">
        ${incubationNotice(shipment)}
        <div class="incubation-strip">${incubation.required ? incubation.targets.map(target => `<div><strong>${target.temp}</strong><span>${target.units} units</span><span>Target ${formatDate(target.date)}</span></div>`).join("") : `<div><strong>No incubation required</strong><span>Ready for testing</span></div>`}</div>
        <div class="toolbar">
          <h3>Batches</h3>
          <button class="ghost" data-action="edit-shipment" data-id="${shipment.id}">Edit shipment</button>
        </div>
        <div class="batch-grid">${shipment.batches.map(batch => batchSummaryCard({ ...batch, shipment })).join("") || empty("No batches recorded.")}</div>
      </div>
    </details>
  `;
}

function incubationNotice(shipment) {
  const incubation = shipmentIncubation(shipment);
  if (!incubation.required) return "";
  if (incubation.due) {
    return `
      <div class="notice danger-notice">
        <strong>Incubation target date has arrived.</strong>
        <p>Remove products from the incubator and mark this shipment as exited before testing.</p>
        <div class="button-row">
          <button class="ok" data-action="mark-incubation-exited" data-id="${shipment.id}">Mark exited incubation</button>
        </div>
      </div>
    `;
  }
  if (incubation.exited) {
    return `<div class="notice ${incubation.early ? "warning-notice" : "success-notice"}"><strong>${incubation.status}</strong><p>${incubation.early ? `Removed early on ${formatDate(shipment.incubationRemovedEarlyAt)}. Original target: ${incubation.targets.map(target => `${target.temp} ${formatDate(target.date)}`).join(" / ")}.` : `Marked exited on ${formatDate(shipment.incubationExitedAt)}.`}</p></div>`;
  }
  return `<div class="notice neutral-notice"><strong>Shipment is in incubation.</strong><p>Testing is locked until the shipment is marked as exited. Target: ${incubation.targets.map(target => `${target.temp} ${formatDate(target.date)}`).join(" / ")}.</p><button class="danger" data-action="early-incubation" data-id="${shipment.id}">Remove early</button></div>`;
}

function batchSummaryCard(batch) {
  const parsed = productionDateFromBatchNumber(batch.number);
  return `
    <div class="batch-summary-card">
      <div class="row">
        <div>
          <strong>${escapeHtml(batch.number)}</strong>
          <div class="muted">${batch.productionDate ? `Production ${formatDate(batch.productionDate)}` : "No production date"}${parsed.valid ? " / detected from code" : ""}</div>
        </div>
        <span class="pill ${batchStatus(batch) === "Approved" ? "good" : batchStatus(batch) === "Ready for review" ? "warn" : ""}">${batchStatus(batch)}</span>
      </div>
      <div class="muted">Expiration: ${batch.expirationDate ? formatDate(batch.expirationDate) : "-"}</div>
    </div>
  `;
}

function renderTesting() {
  const activeShipments = state.shipments.filter(shipment => shipment.batches.some(batch => !batch.approvedAt));
  document.querySelector("#testing").innerHTML = `
    <div class="toolbar"><h2>Technician Testing</h2><span class="pill">Blind entry mode</span></div>
    <div class="grid">${activeShipments.map(shipment => {
      const template = templateFor(shipment.templateId);
      const locked = !testingAllowed(shipment);
      return `<div class="panel">
        <div class="toolbar">
          <div><h3>${escapeHtml(template.name)}</h3><div class="muted">${shipment.size ? `${escapeHtml(shipment.size)} / ` : ""}${escapeHtml(shipment.supplier)} / arrived ${shipment.intakeDate}</div></div>
          <span class="pill ${locked ? "bad" : ""}">${locked ? "Testing locked" : shipmentStatus(shipment)}</span>
        </div>
        ${locked ? incubationNotice(shipment) : ""}
        <div class="grid">${shipment.batches.filter(batch => !batch.approvedAt).map(batch => {
          const richBatch = { ...batch, shipment };
          return `<details class="batch-test-panel" ${batchStatus(richBatch) !== "Pending tests" ? "open" : ""}>
            <summary>
              <div class="shipment-summary">
                <div><strong>${escapeHtml(batch.number)}</strong><div class="muted">Production ${batch.productionDate ? formatDate(batch.productionDate) : "-"}</div></div>
                <span class="pill">${batchStatus(richBatch)}</span>
              </div>
            </summary>
            <div class="batch-test-body grid two">${template.tests.map(testId => {
              const calc = calculationFor(batch.id, testId);
              return `<div class="card">
                <div class="row"><strong>${escapeHtml(testMap[testId].name)}</strong><span class="pill ${calc.complete ? "good" : "warn"}">${calc.complete ? "Entered" : "Pending"}</span></div>
                ${locked ? `<button class="ghost" disabled>Locked until incubation exit</button>` : `<button class="btn" data-action="enter-result" data-batch="${batch.id}" data-test="${testId}">Enter raw data</button>`}
              </div>`;
            }).join("")}</div>
          </details>`;
        }).join("")}</div>
      </div>`;
    }).join("") || `<div class="panel">${empty("No active batches need testing.")}</div>`}</div>
  `;
}

function renderTemplates() {
  document.querySelector("#templates").innerHTML = `
    <div class="toolbar">
      <h2>Product Templates</h2>
      <button class="btn" data-action="new-template">+ Product</button>
    </div>
    <div class="grid two">${state.templates.map(template => `
      <div class="panel">
        <div class="toolbar">
          <div><h3>${escapeHtml(template.name)}</h3><div class="muted">${escapeHtml(template.packaging || "Shared test program")}</div></div>
          <button class="ghost" data-action="edit-template" data-id="${template.id}">Edit</button>
        </div>
        <p class="muted">Incubation: 36C ${template.incubation36 || 0} days / 55C ${template.incubation55 || 0} days</p>
        <div>${template.tests.map(id => `<span class="pill">${escapeHtml(testMap[id]?.name || id)}</span>`).join(" ")}</div>
      </div>
    `).join("")}</div>
  `;
}

function renderReview() {
  const batches = allBatches();
  document.querySelector("#review").innerHTML = `
    <div class="toolbar"><h2>Manager Review</h2><span class="pill">Standards visible</span></div>
    <div class="grid">${batches.map(batch => {
      const template = templateFor(batch.shipment.templateId);
      return `<div class="panel">
        <div class="toolbar">
          <div><h3>${escapeHtml(batch.number)}</h3><div class="muted">${escapeHtml(template.name)}${batch.shipment.size ? ` / ${escapeHtml(batch.shipment.size)}` : ""} / ${escapeHtml(batch.shipment.supplier)}</div></div>
          ${batch.approvedAt ? `<span class="pill good">Approved ${batch.approvedAt}</span>` : `<button class="ok" data-action="approve-batch" data-id="${batch.id}">Approve</button>`}
        </div>
        <div class="grid two">${template.tests.map(testId => reviewCard(template, batch.id, testId)).join("")}</div>
      </div>`;
    }).join("") || `<div class="panel">${empty("No batches to review.")}</div>`}</div>
  `;
}

function reviewCard(template, batchId, testId) {
  const calc = calculationFor(batchId, testId);
  const standard = template.standards[testId] || {};
  const ok = withinStandard(template, testId, calc);
  return `<div class="card test-card ${ok ? "" : "out-of-range"}">
    <div class="row"><strong>${escapeHtml(testMap[testId].name)}</strong><span class="pill ${ok ? "good" : "bad"}">${ok ? "In range" : "Out of range"}</span></div>
    <p>${escapeHtml(calc.label)}</p>
    <p class="muted">Standard: min ${standard.min === "" || standard.min === undefined ? "-" : standard.min} / max ${standard.max === "" || standard.max === undefined ? "-" : standard.max}</p>
  </div>`;
}

function renderCoa() {
  const approved = allBatches().filter(batch => batch.approvedAt);
  const selected = approved[0];
  document.querySelector("#coa").innerHTML = `
    <div class="toolbar no-print">
      <h2>Certificate of Analysis</h2>
      <div class="segmented">
        <select id="coa-select">${approved.map(batch => `<option value="${batch.id}">${escapeHtml(batch.number)}</option>`).join("")}</select>
        <button class="btn" onclick="window.print()">Print / Save PDF</button>
      </div>
    </div>
    <div id="coa-body">${selected ? coaMarkup(selected) : `<div class="panel">${empty("Approve a batch to generate its COA.")}</div>`}</div>
  `;
  const select = document.querySelector("#coa-select");
  if (select) select.addEventListener("change", event => {
    const batch = approved.find(item => item.id === event.target.value);
    document.querySelector("#coa-body").innerHTML = coaMarkup(batch);
  });
}

function coaMarkup(batch) {
  const template = templateFor(batch.shipment.templateId);
  return `<article class="coa-page">
    <div class="coa-head">
      <div><div class="coa-title">Certificate of Analysis</div><p class="muted">Food Quality Control Laboratory</p></div>
      <div><strong>Approved</strong><br>${batch.approvedAt}</div>
    </div>
    <div class="grid two">
      <div><h3>Product</h3><p>${escapeHtml(template.name)}<br>Size: ${escapeHtml(batch.shipment.size || "-")}</p></div>
      <div><h3>Batch</h3><p>${escapeHtml(batch.number)}<br>Production: ${batch.productionDate || "-"}<br>Expiration: ${batch.expirationDate || "-"}</p></div>
      <div><h3>Supplier</h3><p>${escapeHtml(batch.shipment.supplier)}</p></div>
      <div><h3>Intake</h3><p>${batch.shipment.intakeDate}</p></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Test</th><th>Final Result</th></tr></thead>
        <tbody>${template.tests.map(testId => `<tr><td>${escapeHtml(testMap[testId].name)}</td><td>${escapeHtml(calculationFor(batch.id, testId).label)}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  </article>`;
}

function openShipmentModal(id) {
  const shipment = id ? state.shipments.find(item => item.id === id) : { id: uid(), templateId: state.templates[0]?.id || "", supplier: "", intakeDate: todayIso(), size: "", units36: 0, units55: 0, exit36: "", exit55: "", batches: [] };
  openModal(id ? "Shipment" : "New Shipment", `
    <form id="shipment-form" class="stack">
      <div class="form-grid">
        <label>Product<select name="templateId">${state.templates.map(template => `<option value="${template.id}" ${template.id === shipment.templateId ? "selected" : ""}>${escapeHtml(template.name)}</option>`).join("")}</select></label>
        <label>Supplier<input name="supplier" value="${escapeAttr(shipment.supplier)}" required></label>
        <label>Intake date<input type="date" name="intakeDate" value="${shipment.intakeDate}" required></label>
        <label>Product size / unit<input name="size" value="${escapeAttr(shipment.size)}" placeholder="140 g, 960 g, 1 L"></label>
      </div>
      <div class="section-head">
        <div>
          <h3>Shared incubation</h3>
          <p class="muted">Most shipments enter and exit incubation together. Batches inherit these dates.</p>
        </div>
      </div>
      <div class="form-grid">
        <label>Units at 36C<input type="number" min="0" name="units36" value="${shipment.units36 || 0}"></label>
        <label>Units at 55C<input type="number" min="0" name="units55" value="${shipment.units55 || 0}"></label>
      </div>
      <div id="incubation-preview" class="incubation-strip"></div>
      <div class="section-head">
        <div>
          <h3>Batches</h3>
          <p class="muted">Each batch receives its own testing record and COA.</p>
        </div>
        <button type="button" class="ghost" data-action="add-batch-row">+ Batch</button>
      </div>
      <div id="batch-list" class="stack">${shipment.batches.map(batchForm).join("") || batchForm()}</div>
      <button class="btn">Save Shipment</button>
    </form>
  `);
  document.querySelector("#shipment-form").dataset.id = shipment.id;
  document.querySelector("#shipment-form").addEventListener("submit", event => saveShipment(event, shipment));
  updateIncubationPreview();
  document.querySelectorAll(".batch-form").forEach(updateBatchCodeHint);
}

function batchForm(batch = {}) {
  const parsed = productionDateFromBatchNumber(batch.number);
  const productionDate = batch.productionDate || (parsed.valid ? parsed.iso : "");
  return `<div class="card batch-form" data-id="${batch.id || uid()}">
    <div class="batch-form-head">
      <strong>Batch</strong>
      <button type="button" class="icon-btn" data-action="remove-batch-row" aria-label="Remove batch">x</button>
    </div>
    <div class="form-grid">
      <label>Batch number<input name="number" value="${escapeAttr(batch.number || "")}" required></label>
      <label>Production date<input type="date" name="productionDate" value="${productionDate}"></label>
      <label>Expiration date<input type="date" name="expirationDate" value="${batch.expirationDate || ""}"></label>
    </div>
    <div class="batch-code-hint ${parsed.matched ? "" : "hidden"} ${parsed.valid ? "good-hint" : "bad-hint"}">${escapeHtml(parsed.message)}</div>
  </div>`;
}

function saveShipment(event, original) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const template = templateFor(data.templateId);
  const batches = [...form.querySelectorAll(".batch-form")].map(row => {
    const rowData = Object.fromEntries([...row.querySelectorAll("input")].map(input => [input.name, input.value]));
    const parsed = productionDateFromBatchNumber(rowData.number);
    return {
      id: row.dataset.id,
      number: rowData.number,
      productionDate: rowData.productionDate || (parsed.valid ? parsed.iso : ""),
      expirationDate: rowData.expirationDate,
      approvedAt: original.batches?.find(batch => batch.id === row.dataset.id)?.approvedAt || ""
    };
  });
  const units36 = Number(data.units36 || 0);
  const units55 = Number(data.units55 || 0);
  const shipment = {
    id: original.id,
    templateId: data.templateId,
    supplier: data.supplier,
    intakeDate: data.intakeDate,
    size: data.size,
    units36,
    units55,
    exit36: units36 && Number(template.incubation36 || 0) ? addDays(data.intakeDate, template.incubation36) : "",
    exit55: units55 && Number(template.incubation55 || 0) ? addDays(data.intakeDate, template.incubation55) : "",
    incubationExitedAt: original.incubationExitedAt || "",
    incubationRemovedEarlyAt: original.incubationRemovedEarlyAt || "",
    incubationEarlyAcknowledgedAt: original.incubationEarlyAcknowledgedAt || "",
    batches
  };
  const index = state.shipments.findIndex(item => item.id === shipment.id);
  if (index >= 0) state.shipments[index] = shipment;
  else state.shipments.push(shipment);
  save();
  closeModal();
  render();
}

function updateIncubationPreview() {
  const form = document.querySelector("#shipment-form");
  const preview = document.querySelector("#incubation-preview");
  if (!form || !preview) return;
  const template = templateFor(form.templateId.value);
  const intakeDate = form.intakeDate.value;
  const units36 = Number(form.units36.value || 0);
  const units55 = Number(form.units55.value || 0);
  const blocks = [];
  if (units36 > 0 && Number(template?.incubation36 || 0) > 0) blocks.push(`<div><strong>36C</strong><span>${units36} units</span><span>Target ${formatDate(addDays(intakeDate, template.incubation36))}</span></div>`);
  if (units55 > 0 && Number(template?.incubation55 || 0) > 0) blocks.push(`<div><strong>55C</strong><span>${units55} units</span><span>Target ${formatDate(addDays(intakeDate, template.incubation55))}</span></div>`);
  preview.innerHTML = blocks.length ? blocks.join("") : `<div><strong>No incubation required</strong><span>Shipment will go directly to pending tests.</span></div>`;
}

function updateBatchCodeHint(batchFormEl) {
  const numberInput = batchFormEl.querySelector('[name="number"]');
  const dateInput = batchFormEl.querySelector('[name="productionDate"]');
  const hint = batchFormEl.querySelector(".batch-code-hint");
  const parsed = productionDateFromBatchNumber(numberInput.value);
  if (parsed.valid && !dateInput.dataset.edited) dateInput.value = parsed.iso;
  hint.textContent = parsed.message;
  hint.classList.toggle("hidden", !parsed.matched);
  hint.classList.toggle("good-hint", parsed.valid);
  hint.classList.toggle("bad-hint", parsed.matched && !parsed.valid);
}

function openTemplateModal(id) {
  const template = id ? templateFor(id) : { id: uid(), name: "", packaging: "", incubation36: 0, incubation55: 0, tests: [], standards: {} };
  openModal(id ? "Edit Product Template" : "New Product Template", `
    <form id="template-form" class="stack">
      <div class="form-grid">
        <label>Product type<input name="name" value="${escapeAttr(template.name)}" required></label>
        <label>Template note<input name="packaging" value="${escapeAttr(template.packaging)}" placeholder="Shared tests for canned tuna"></label>
        <label>Incubation days 36C<input type="number" min="0" name="incubation36" value="${template.incubation36 || 0}"></label>
        <label>Incubation days 55C<input type="number" min="0" name="incubation55" value="${template.incubation55 || 0}"></label>
      </div>
      <h3>Tests and manager-only standards</h3>
      <div class="grid two">${TESTS.map(test => {
        const standard = template.standards[test.id] || {};
        return `<div class="card">
          <label><span><input type="checkbox" name="tests" value="${test.id}" ${template.tests.includes(test.id) ? "checked" : ""}> ${escapeHtml(test.name)}</span></label>
          <div class="form-grid">
            <label>Min<input type="number" step="any" name="min:${test.id}" value="${standard.min ?? ""}"></label>
            <label>Max<input type="number" step="any" name="max:${test.id}" value="${standard.max ?? ""}"></label>
          </div>
        </div>`;
      }).join("")}</div>
      <button class="btn">Save Product</button>
    </form>
  `);
  document.querySelector("#template-form").addEventListener("submit", event => saveTemplate(event, template.id));
}

function saveTemplate(event, id) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const tests = data.getAll("tests");
  const standards = {};
  tests.forEach(testId => {
    const min = data.get(`min:${testId}`);
    const max = data.get(`max:${testId}`);
    if (min !== "" || max !== "") standards[testId] = { min: min === "" ? "" : Number(min), max: max === "" ? "" : Number(max) };
  });
  const template = {
    id,
    name: data.get("name"),
    packaging: data.get("packaging"),
    incubation36: Number(data.get("incubation36") || 0),
    incubation55: Number(data.get("incubation55") || 0),
    tests,
    standards
  };
  const index = state.templates.findIndex(item => item.id === id);
  if (index >= 0) state.templates[index] = template;
  else state.templates.push(template);
  save();
  closeModal();
  render();
}

function openResultModal(batchId, testId) {
  const batch = allBatches().find(item => item.id === batchId);
  const test = testMap[testId];
  const rows = getRows(batchId, testId);
  openModal(test.name, `
    <div class="stack">
      <p class="muted">${escapeHtml(batch.number)} / raw technician entry</p>
      <div id="replicate-list" class="stack">${(rows.length ? rows : [{}]).map(row => replicateForm(test, row)).join("")}</div>
      <button class="ghost" data-action="add-replicate" data-test="${testId}">+ Replicate</button>
      <button class="btn" data-action="save-result" data-batch="${batchId}" data-test="${testId}">Save Raw Data</button>
    </div>
  `);
}

function replicateForm(test, row = {}) {
  return `<div class="replicate">
    <div class="replicate-fields">${test.fields.map(field => fieldInput(field, row[field.id])).join("")}</div>
    <button class="icon-btn" data-action="remove-replicate" aria-label="Remove replicate">x</button>
  </div>`;
}

function fieldInput(field, value = "") {
  if (field.type === "select") {
    return `<label>${escapeHtml(field.label)}<select name="${field.id}">${field.options.map(([optionValue, label]) => `<option value="${optionValue}" ${String(value) === optionValue ? "selected" : ""}>${label}</option>`).join("")}</select></label>`;
  }
  if (field.type === "passfail") {
    return `<label>${escapeHtml(field.label)}<select name="${field.id}"><option value="">Select</option><option ${value === "Pass" ? "selected" : ""}>Pass</option><option ${value === "Fail" ? "selected" : ""}>Fail</option></select></label>`;
  }
  if (field.type === "checkbox") {
    return `<label><span><input type="checkbox" name="${field.id}" ${value ? "checked" : ""}> ${escapeHtml(field.label)}</span></label>`;
  }
  const type = field.type === "number" ? "number" : "text";
  const step = type === "number" ? ` step="any"` : "";
  return `<label>${escapeHtml(field.label)}<input type="${type}"${step} name="${field.id}" value="${escapeAttr(value)}"></label>`;
}

function saveResult(batchId, testId) {
  const test = testMap[testId];
  const rows = [...document.querySelectorAll(".replicate")].map(rep => {
    const row = {};
    test.fields.forEach(field => {
      const input = rep.querySelector(`[name="${field.id}"]`);
      row[field.id] = field.type === "checkbox" ? input.checked : input.value;
    });
    return row;
  });
  setRows(batchId, testId, rows);
  closeModal();
  render();
}

function approveBatch(batchId) {
  state.shipments.forEach(shipment => shipment.batches.forEach(batch => {
    if (batch.id === batchId) batch.approvedAt = todayIso();
  }));
  save();
  render();
}

function markIncubationExited(shipmentId) {
  const shipment = state.shipments.find(item => item.id === shipmentId);
  if (!shipment) return;
  shipment.incubationExitedAt = todayIso();
  shipment.incubationRemovedEarlyAt = "";
  shipment.incubationEarlyAcknowledgedAt = "";
  save();
  render();
}

function openEarlyIncubationModal(shipmentId) {
  const shipment = state.shipments.find(item => item.id === shipmentId);
  if (!shipment) return;
  const incubation = shipmentIncubation(shipment);
  openModal("Remove From Incubation Early", `
    <div class="stack">
      <div class="notice danger-notice">
        <strong>This shipment is not scheduled to exit incubation yet.</strong>
        <p>The target date is ${incubation.targets.map(target => `${target.temp} ${formatDate(target.date)}`).join(" / ")}. Removing products early may invalidate the workflow. Confirm only if authorized.</p>
      </div>
      <button class="danger" data-action="acknowledge-early-incubation" data-id="${shipment.id}">Acknowledge and mark removed early</button>
    </div>
  `);
}

function acknowledgeEarlyIncubation(shipmentId) {
  const shipment = state.shipments.find(item => item.id === shipmentId);
  if (!shipment) return;
  shipment.incubationRemovedEarlyAt = todayIso();
  shipment.incubationEarlyAcknowledgedAt = todayIso();
  shipment.incubationExitedAt = "";
  save();
  closeModal();
  render();
}

function openModal(title, body) {
  const template = document.querySelector("#modal-template").content.cloneNode(true);
  template.querySelector("h2").textContent = title;
  template.querySelector(".modal-body").innerHTML = body;
  document.body.appendChild(template);
}

function closeModal() {
  document.querySelector(".modal-backdrop")?.remove();
}

function empty(text) {
  return `<p class="muted">${text}</p>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}

document.addEventListener("click", event => {
  const target = event.target.closest("[data-action], .role-btn, .tab-btn, .close-modal");
  if (!target) return;
  if (target.classList.contains("role-btn")) {
    role = target.dataset.role;
    render();
  } else if (target.classList.contains("tab-btn")) {
    activeView = target.dataset.view;
    render();
  } else if (target.classList.contains("close-modal")) {
    closeModal();
  } else if (target.dataset.action === "new-shipment") {
    openShipmentModal();
  } else if (target.dataset.action === "edit-shipment") {
    openShipmentModal(target.dataset.id);
  } else if (target.dataset.action === "add-batch-row") {
    document.querySelector("#batch-list").insertAdjacentHTML("beforeend", batchForm());
  } else if (target.dataset.action === "remove-batch-row") {
    if (document.querySelectorAll(".batch-form").length > 1) target.closest(".batch-form").remove();
  } else if (target.dataset.action === "new-template") {
    openTemplateModal();
  } else if (target.dataset.action === "edit-template") {
    openTemplateModal(target.dataset.id);
  } else if (target.dataset.action === "enter-result") {
    const batch = allBatches().find(item => item.id === target.dataset.batch);
    if (batch && testingAllowed(batch.shipment)) openResultModal(target.dataset.batch, target.dataset.test);
  } else if (target.dataset.action === "add-replicate") {
    const test = testMap[target.dataset.test];
    const count = document.querySelectorAll(".replicate").length;
    if (test.max && count >= test.max) return;
    if (test.single && count >= 1) return;
    document.querySelector("#replicate-list").insertAdjacentHTML("beforeend", replicateForm(test));
  } else if (target.dataset.action === "remove-replicate") {
    if (document.querySelectorAll(".replicate").length > 1) target.closest(".replicate").remove();
  } else if (target.dataset.action === "save-result") {
    saveResult(target.dataset.batch, target.dataset.test);
  } else if (target.dataset.action === "approve-batch") {
    approveBatch(target.dataset.id);
  } else if (target.dataset.action === "mark-incubation-exited") {
    markIncubationExited(target.dataset.id);
  } else if (target.dataset.action === "early-incubation") {
    openEarlyIncubationModal(target.dataset.id);
  } else if (target.dataset.action === "acknowledge-early-incubation") {
    acknowledgeEarlyIncubation(target.dataset.id);
  }
});

document.addEventListener("input", event => {
  if (event.target.closest("#shipment-form") && ["templateId", "intakeDate", "units36", "units55"].includes(event.target.name)) {
    updateIncubationPreview();
  }
  if (event.target.name === "number" && event.target.closest(".batch-form")) {
    updateBatchCodeHint(event.target.closest(".batch-form"));
  }
  if (event.target.name === "productionDate") {
    event.target.dataset.edited = "true";
  }
});

document.addEventListener("change", event => {
  if (event.target.closest("#shipment-form") && ["templateId", "intakeDate", "units36", "units55"].includes(event.target.name)) {
    updateIncubationPreview();
  }
});

render();
