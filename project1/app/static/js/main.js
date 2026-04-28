// Waveform Monitor frontend — talks to the Flask API for all data.

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  sources: [],
  selectedSource: null,
  waveforms: [],          // filenames for selected source
  selectedWaveform: null,
  currentWaveformData: null,
  metricsHistory: [],
  multiCompareSlots: [{source: null, file: null}, {source: null, file: null}],
};

// ---------------------------------------------------------------------------
// Chart instances
// ---------------------------------------------------------------------------
let waveformChart = null;
let fftChart = null;
let metricsChart = null;
let multiWaveformChart = null;
let multiFftChart = null;

const MULTI_COLORS = ["#4f8ef7", "#f76b4f", "#4fd18a", "#f7d24f", "#b44ff7"];
const SLOT_NAMES  = ["Waveform A", "Waveform B", "Waveform C", "Waveform D", "Waveform E"];

const CHART_DEFAULTS = {
  animation: false,
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: "#091426", font: { size: 11 } } } },
  scales: {
    x: { ticks: { color: "#667085", maxTicksLimit: 10 }, grid: { color: "#d7dce6" } },
    y: { ticks: { color: "#667085" }, grid: { color: "#d7dce6" } },
  },
};

function makeLineDataset(label, data, color) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0,
  };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function setStatus(msg, isError = false) {
  const bar = document.getElementById("status-bar");
  bar.textContent = msg;
  bar.style.color = isError ? "var(--danger)" : "var(--text-muted)";
}

// ---------------------------------------------------------------------------
// Sidebar: sources and waveforms
// ---------------------------------------------------------------------------
async function loadSources() {
  try {
    const data = await apiFetch("/api/sources");
    state.sources = data.sources || [];
    renderSourceList();
    setStatus(`${state.sources.length} source(s) loaded.`);
  } catch (e) {
    setStatus(`Error loading sources: ${e.message}`, true);
  }
}

function renderSourceList() {
  const list = document.getElementById("source-list");
  list.innerHTML = "";
  if (state.sources.length === 0) {
    list.innerHTML = '<li style="color:var(--text-muted);font-style:italic">No sources</li>';
    return;
  }
  state.sources.forEach(src => {
    const li = document.createElement("li");
    li.textContent = src;
    li.dataset.source = src;
    if (src === state.selectedSource) li.classList.add("active");
    li.addEventListener("click", () => selectSource(src));
    list.appendChild(li);
  });
}

async function selectSource(sourceId) {
  state.selectedSource = sourceId;
  state.selectedWaveform = null;
  state.currentWaveformData = null;
  renderSourceList();

  try {
    const data = await apiFetch(`/api/sources/${sourceId}/waveforms`);
    state.waveforms = data.waveforms || [];
    renderWaveformList();
    await loadMetricsHistory(sourceId);
    setStatus(`Source: ${sourceId} — ${state.waveforms.length} waveform(s)`);
  } catch (e) {
    setStatus(`Error loading waveforms: ${e.message}`, true);
  }
}

function renderWaveformList() {
  const list = document.getElementById("waveform-list");
  list.innerHTML = "";
  if (state.waveforms.length === 0) {
    list.innerHTML = '<li style="color:var(--text-muted);font-style:italic">No waveforms</li>';
    return;
  }
  state.waveforms.forEach(fname => {
    const li = document.createElement("li");
    li.textContent = fname;
    li.dataset.file = fname;
    if (fname === state.selectedWaveform) li.classList.add("active");
    li.addEventListener("click", () => loadWaveform(state.selectedSource, fname));
    list.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// Waveform view
// ---------------------------------------------------------------------------
async function loadWaveform(sourceId, filename) {
  state.selectedWaveform = filename;
  renderWaveformList();
  setStatus(`Loading ${filename}…`);

  try {
    const data = await apiFetch(`/api/sources/${sourceId}/waveforms/${filename}?max_points=1000`);
    state.currentWaveformData = data;
    renderWaveformChart(data);
    renderFftChart();
    renderMetricTiles(data);
    setStatus(`${filename} — ${data.num_samples} samples @ ${data.sample_rate} Hz`);
  } catch (e) {
    setStatus(`Error loading waveform: ${e.message}`, true);
  }
}

function renderWaveformChart(data) {
  const ctx = document.getElementById("waveform-chart").getContext("2d");
  const xs = Array.from({ length: data.samples.length }, (_, i) =>
    (i / data.samples.length * data.duration_s).toFixed(4)
  );

  if (waveformChart) waveformChart.destroy();
  waveformChart = new Chart(ctx, {
    type: "line",
    data: { labels: xs, datasets: [makeLineDataset(data.filename, data.samples, "#4f8ef7")] },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.y.toFixed(5)} ${data.units || ""}` } },
      },
      scales: {
        ...CHART_DEFAULTS.scales,
        x: { ...CHART_DEFAULTS.scales.x, title: { display: true, text: "Time (s)", color: "#667085" } },
        y: { ...CHART_DEFAULTS.scales.y, title: { display: true, text: data.units || "Amplitude", color: "#667085" } },
      },
    },
  });
}

function renderFftChart() {
  // Use the already-loaded downsampled waveform data — no extra request needed
  if (!state.currentWaveformData) return;
  const samples = state.currentWaveformData.samples;
  const sampleRate = state.currentWaveformData.display_sample_rate ?? state.currentWaveformData.sample_rate;
  const n = samples.length;
  const half = Math.floor(n / 2);
  const freqBinHz = sampleRate / n;

  // DFT on the downsampled data (~1000 points, fast enough in JS)
  const freqs = [];
  const mags = [];
  for (let k = 1; k < half; k++) {   // skip DC bin at k=0
    let sr = 0, si = 0;
    for (let t = 0; t < n; t++) {
      const angle = (2 * Math.PI * k * t) / n;
      sr += samples[t] * Math.cos(angle);
      si -= samples[t] * Math.sin(angle);
    }
    freqs.push((k * freqBinHz).toFixed(1));
    mags.push(Math.sqrt(sr * sr + si * si) * 2 / n);
  }

  const ctx = document.getElementById("fft-chart").getContext("2d");
  if (fftChart) fftChart.destroy();
  fftChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: freqs,
      datasets: [makeLineDataset("FFT Magnitude", mags, "#4fd18a")],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { ...CHART_DEFAULTS.scales.x, title: { display: true, text: "Frequency (Hz)", color: "#667085" } },
        y: { ...CHART_DEFAULTS.scales.y, title: { display: true, text: "Magnitude", color: "#667085" } },
      },
    },
  });
}

function renderMetricTiles(waveformData) {
  const grid = document.getElementById("metrics-tiles");
  const metrics = waveformData.metrics;
  if (!metrics) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="icon">[]</div>
        <div>Metrics unavailable for this waveform.</div>
      </div>
    `;
    return;
  }

  const tiles = [
    { label: "Peak-to-Peak", value: Number(metrics.peak_to_peak).toFixed(5) },
    { label: "RMS", value: Number(metrics.rms).toFixed(5) },
    { label: "Mean", value: Number(metrics.mean).toFixed(5) },
    { label: "Std Dev", value: Number(metrics.std).toFixed(5) },
    { label: "SNR (dB)", value: metrics.snr_db !== null ? Number(metrics.snr_db).toFixed(2) : "N/A" },
    { label: "Dom. Freq (Hz)", value: Number(metrics.dominant_freq_hz).toFixed(2) },
    { label: "Samples", value: Number(metrics.num_samples).toLocaleString() },
    { label: "Sample Rate", value: `${waveformData.sample_rate} Hz` },
  ];

  grid.innerHTML = tiles.map(t => `
    <div class="metric-tile">
      <div class="label">${t.label}</div>
      <div class="value">${t.value}</div>
    </div>
  `).join("");
}

// ---------------------------------------------------------------------------
// Metrics history trend chart
// ---------------------------------------------------------------------------
async function loadMetricsHistory(sourceId) {
  try {
    const data = await apiFetch(`/api/sources/${sourceId}/metrics`);
    state.metricsHistory = data.metrics || [];
    renderMetricsHistory();
  } catch (e) {
    console.warn("Metrics history error:", e);
  }
}

function renderMetricsHistory() {
  const rows = state.metricsHistory;
  const ctx = document.getElementById("metrics-trend-chart").getContext("2d");
  if (metricsChart) metricsChart.destroy();

  if (rows.length === 0) {
    // Draw placeholder so the canvas isn't blank
    metricsChart = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [] },
      options: {
        ...CHART_DEFAULTS,
        plugins: {
          ...CHART_DEFAULTS.plugins,
          title: { display: true, text: "Select a source to view metrics trend", color: "#667085" },
        },
      },
    });
    return;
  }

  const labels = rows.map(r => r.filename);

  metricsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Peak-to-Peak",
          data: rows.map(r => parseFloat(r.peak_to_peak)),
          backgroundColor: "rgba(79,142,247,0.7)",
          borderColor: "#4f8ef7",
          borderWidth: 1,
          yAxisID: "y",
        },
        {
          label: "RMS",
          data: rows.map(r => parseFloat(r.rms)),
          backgroundColor: "rgba(79,209,138,0.7)",
          borderColor: "#4fd18a",
          borderWidth: 1,
          yAxisID: "y",
        },
        {
          label: "Dominant Freq (Hz)",
          data: rows.map(r => parseFloat(r.dominant_freq_hz)),
          backgroundColor: "rgba(247,210,79,0.7)",
          borderColor: "#f7d24f",
          borderWidth: 1,
          yAxisID: "yFreq",
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x:     { ...CHART_DEFAULTS.scales.x, title: { display: true, text: "Capture", color: "#667085" } },
        y:     { ...CHART_DEFAULTS.scales.y, position: "left",  title: { display: true, text: "Amplitude", color: "#667085" }, beginAtZero: true },
        yFreq: { ...CHART_DEFAULTS.scales.y, position: "right", title: { display: true, text: "Frequency (Hz)", color: "#0014dc" },
                 grid: { drawOnChartArea: false }, beginAtZero: true },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Multi-waveform comparison
// ---------------------------------------------------------------------------
const COMPARE_SOURCES = ["sourceA", "sourceB", "sourceC", "sourceD", "sourceE"];

function renderMultiCompareRows() {
  const container = document.getElementById("multi-compare-rows");
  if (!container) return;
  container.innerHTML = "";

  const slots = state.multiCompareSlots;
  const n = slots.length;
  const srcOptions = COMPARE_SOURCES.map(s => `<option value="${s}">${s}</option>`).join("");

  slots.forEach((slot, idx) => {
    const row = document.createElement("div");
    row.className = "multi-compare-row";

    row.innerHTML = `
      <div class="slot-badge" style="background:${MULTI_COLORS[idx]}">${idx + 1}</div>
      <div class="form-group" style="flex:1;min-width:140px">
        <label>Source</label>
        <select class="multi-source-sel" data-slot="${idx}">
          <option value="">-- Select --</option>
          ${srcOptions}
        </select>
      </div>
      <div class="form-group" style="flex:1;min-width:140px">
        <label>File</label>
        <select class="multi-file-sel" data-slot="${idx}">
          <option value="">-- Select --</option>
        </select>
      </div>
      ${n > 2 ? `<button class="btn btn-remove-slot" data-slot="${idx}" title="Remove">×</button>` : '<div style="width:46px"></div>'}
    `;
    container.appendChild(row);

    row.querySelector(".multi-source-sel").addEventListener("change", e =>
      onMultiSourceChange(idx, e.target.value)
    );
    row.querySelector(".multi-file-sel").addEventListener("change", e => {
      state.multiCompareSlots[idx].file = e.target.value || null;
    });
    if (n > 2) {
      row.querySelector(".btn-remove-slot").addEventListener("click", () => removeMultiCompareSlot(idx));
    }

    // Restore previous selection if slot already had one
    if (slot.source) {
      const srcSel = row.querySelector(".multi-source-sel");
      srcSel.value = slot.source;
      onMultiSourceChange(idx, slot.source, slot.file);
    }
  });

  const addBtn = document.getElementById("btn-add-waveform");
  if (addBtn) addBtn.disabled = n >= 5;
}

async function onMultiSourceChange(slotIdx, sourceId, preselectedFile = null) {
  state.multiCompareSlots[slotIdx].source = sourceId || null;
  state.multiCompareSlots[slotIdx].file = null;

  const fileSel = document.querySelector(`.multi-file-sel[data-slot="${slotIdx}"]`);
  if (!fileSel) return;
  fileSel.innerHTML = '<option value="">-- Select --</option>';
  if (!sourceId) return;

  try {
    const data = await apiFetch(`/api/sources/${sourceId}/waveforms`);
    (data.waveforms || []).forEach(f => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      if (f === preselectedFile) {
        opt.selected = true;
        state.multiCompareSlots[slotIdx].file = f;
      }
      fileSel.appendChild(opt);
    });
  } catch (e) {
    console.warn("Failed to load files for slot", slotIdx, e);
  }
}

function addMultiCompareSlot() {
  if (state.multiCompareSlots.length >= 5) return;
  state.multiCompareSlots.push({source: null, file: null});
  renderMultiCompareRows();
}

function removeMultiCompareSlot(idx) {
  if (state.multiCompareSlots.length <= 2) return;
  state.multiCompareSlots.splice(idx, 1);
  renderMultiCompareRows();
}

async function runMultiComparison() {
  const slots = state.multiCompareSlots;
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i].source || !slots[i].file) {
      setStatus(`Select source and file for waveform ${i + 1}.`, true);
      return;
    }
  }

  setStatus("Running comparison…");
  try {
    const result = await apiFetch("/api/compare/multi", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        waveforms: slots.map(s => ({source_id: s.source, filename: s.file})),
      }),
    });
    renderMultiCompareResult(result);
    setStatus(`Comparison complete — ${result.labels.length} waveforms, ${result.pairs.length} pair(s)`);
  } catch (e) {
    setStatus(`Comparison error: ${e.message}`, true);
  }
}

function renderMultiCompareResult(result) {
  const maxLen = Math.max(...result.waveform_arrays.map(a => a.length));
  const sampleLabels = Array.from({length: maxLen}, (_, i) => i);

  // Waveform overlay — label each dataset by slot letter (A, B, C…), not source/file path
  const ctxW = document.getElementById("multi-waveform-chart").getContext("2d");
  if (multiWaveformChart) multiWaveformChart.destroy();
  multiWaveformChart = new Chart(ctxW, {
    type: "line",
    data: {
      labels: sampleLabels,
      datasets: result.waveform_arrays.map((arr, i) =>
        makeLineDataset(SLOT_NAMES[i], arr, MULTI_COLORS[i])
      ),
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: {...CHART_DEFAULTS.scales.x, title: {display: true, text: "Sample", color: "#667085"}},
        y: {...CHART_DEFAULTS.scales.y, title: {display: true, text: "Amplitude", color: "#667085"}},
      },
    },
  });

  // Pairwise metrics table — slot letter as primary label, source/file as secondary
  document.getElementById("multi-pairs-table").innerHTML = `
    <table class="metrics-table">
      <thead>
        <tr>
          <th>Pair</th>
          <th>RMSE</th>
          <th>Correlation</th>
          <th>Lag (samples)</th>
        </tr>
      </thead>
      <tbody>
        ${result.pairs.map(p => `
          <tr>
            <td>
              <span class="pair-dot" style="background:${MULTI_COLORS[p.i]}"></span>
              <strong>${SLOT_NAMES[p.i]}</strong>
              <span style="color:var(--text-muted);font-size:11px;margin-left:4px">${p.label_i}</span>
              &nbsp;vs&nbsp;
              <span class="pair-dot" style="background:${MULTI_COLORS[p.j]}"></span>
              <strong>${SLOT_NAMES[p.j]}</strong>
              <span style="color:var(--text-muted);font-size:11px;margin-left:4px">${p.label_j}</span>
            </td>
            <td>${p.rmse.toFixed(6)}</td>
            <td>${p.correlation.toFixed(4)}</td>
            <td>${p.alignment_lag_samples}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  // FFT overlay
  const ctxF = document.getElementById("multi-fft-chart").getContext("2d");
  if (multiFftChart) multiFftChart.destroy();
  multiFftChart = new Chart(ctxF, {
    type: "line",
    data: {
      labels: result.fft_data[0].freqs.map(f => Number(f).toFixed(1)),
      datasets: result.fft_data.map((fft, i) =>
        makeLineDataset(`FFT ${SLOT_NAMES[i]}`, fft.magnitudes, MULTI_COLORS[i])
      ),
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: {...CHART_DEFAULTS.scales.x, title: {display: true, text: "Frequency (Hz)", color: "#667085"}},
        y: {...CHART_DEFAULTS.scales.y, title: {display: true, text: "Magnitude", color: "#667085"}},
      },
    },
  });

  // Degradation indicators
  const degDiv = document.getElementById("multi-degradation");
  const flagged = result.pairs.filter(p => p.degradation_indicators && p.degradation_indicators.length > 0);
  if (flagged.length === 0) {
    degDiv.innerHTML = '<div class="no-degradation" style="padding:12px">✓ No degradation indicators detected in any pair.</div>';
  } else {
    degDiv.innerHTML = flagged.map(p => `
      <div class="degradation-pair">
        <div class="degradation-pair-label">
          <span class="pair-dot" style="background:${MULTI_COLORS[p.i]}"></span>
          ${SLOT_NAMES[p.i]} vs
          <span class="pair-dot" style="background:${MULTI_COLORS[p.j]}"></span>
          ${SLOT_NAMES[p.j]}
        </div>
        <ul class="degradation-list">${p.degradation_indicators.map(d => `<li>${d}</li>`).join("")}</ul>
      </div>
    `).join("");
  }
}

// ---------------------------------------------------------------------------
// Ingest (file upload)
// ---------------------------------------------------------------------------
async function ingestFile() {
  const fileInput = document.getElementById("ingest-file");
  const sourceInput = document.getElementById("ingest-source-id");

  if (!fileInput.files.length) {
    setStatus("Select a .bin file to ingest.", true);
    return;
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);
  if (sourceInput.value.trim()) {
    formData.append("source_id", sourceInput.value.trim());
  }

  setStatus("Ingesting…");
  try {
    const result = await apiFetch("/api/ingest", { method: "POST", body: formData });
    setStatus(`Ingested ${result.filename} → source: ${result.source_id} (${result.num_samples} samples)`);
    fileInput.value = "";
    sourceInput.value = "";
    await loadSources();
  } catch (e) {
    setStatus(`Ingest error: ${e.message}`, true);
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
async function loadReports() {
  try {
    const data = await apiFetch("/api/reports");
    const list = document.getElementById("reports-list");
    const reports = data.reports || [];
    if (reports.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="icon">📋</div><div>No reports generated yet.</div></div>';
      return;
    }
    list.innerHTML = `<ul class="reports-list">${reports.map(r =>
      `<li>
        <div class="report-row">
          <a href="/api/reports/${r}" target="_blank">${r}</a>
          <button type="button" class="report-delete-btn" data-report="${r}">Delete</button>
        </div>
      </li>`
    ).join("")}</ul>`;
  } catch (e) {
    setStatus(`Error loading reports: ${e.message}`, true);
  }
}

async function deleteReport(filename) {
  setStatus(`Deleting report ${filename}…`);
  try {
    await apiFetch(`/api/reports/${filename}`, { method: "DELETE" });
    setStatus(`Deleted report: ${filename}`);
    await loadReports();
  } catch (e) {
    setStatus(`Report delete error: ${e.message}`, true);
  }
}

async function generateReport() {
  const sourceId = state.selectedSource;
  if (!sourceId) {
    setStatus("Select a source first.", true);
    return;
  }
  setStatus("Generating report…");
  try {
    const result = await apiFetch("/api/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_id: sourceId }),
    });
    setStatus(`Report generated: ${result.report}`);
    await loadReports();
  } catch (e) {
    setStatus(`Report error: ${e.message}`, true);
  }
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------
const termHistory = [];
let termHistoryIdx = -1;

function termAppend(html) {
  const out = document.getElementById("term-output");
  out.insertAdjacentHTML("beforeend", html);
  out.scrollTop = out.scrollHeight;
}

async function termExec(command) {
  if (!command.trim()) return;

  // Add to history
  termHistory.unshift(command);
  termHistoryIdx = -1;

  // Echo the command
  const escaped = command.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  termAppend(`<span class="term-cmd">waveform-cli&gt; ${escaped}</span>\n`);

  // Handle local "help" shortcut
  if (command.trim() === "help") {
    termAppend(`<span class="term-info">Available commands:
  list-sources          List all ingested waveform sources
  ingest &lt;file&gt;        Ingest a binary waveform file
  analyze --input &lt;f&gt;  Print signal metrics for a waveform
  compare --a &lt;f1&gt; --b &lt;f2&gt;  Compare two waveform files
  report --source &lt;id&gt; Generate an HTML report

Add --help to any command for detailed usage.
</span>`);
    return;
  }

  // Handle local "clear"
  if (command.trim() === "clear") {
    document.getElementById("term-output").innerHTML = "";
    return;
  }

  setStatus("Running command...");
  try {
    const res = await fetch("/api/cli", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    const data = await res.json();
    if (data.output) {
      const cls = data.exit_code !== 0 ? "term-err" : "";
      const text = data.output.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      termAppend(cls ? `<span class="${cls}">${text}</span>` : text);
    }
    setStatus(data.exit_code === 0 ? "Command completed." : "Command failed.");
  } catch (e) {
    termAppend(`<span class="term-err">Error: ${e.message}\n</span>`);
    setStatus("Command error.", true);
  }
}

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabId));
  document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === tabId));
  if (tabId === "tab-compare") renderMultiCompareRows();
  if (tabId === "tab-reports") loadReports();
  if (tabId === "tab-metrics") {
    if (state.selectedSource && state.metricsHistory.length === 0) {
      loadMetricsHistory(state.selectedSource);
    } else {
      renderMetricsHistory();
    }
  }
  if (tabId === "tab-terminal") {
    setTimeout(() => document.getElementById("term-input").focus(), 50);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Tab buttons
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("btn-add-waveform").addEventListener("click", addMultiCompareSlot);
  document.getElementById("btn-run-compare").addEventListener("click", runMultiComparison);
  document.getElementById("btn-ingest").addEventListener("click", ingestFile);
  document.getElementById("btn-refresh").addEventListener("click", loadSources);
  document.getElementById("btn-gen-report").addEventListener("click", generateReport);

  // Terminal
  const termInput = document.getElementById("term-input");
  termInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const cmd = termInput.value;
      termInput.value = "";
      termExec(cmd);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (termHistoryIdx < termHistory.length - 1) {
        termHistoryIdx++;
        termInput.value = termHistory[termHistoryIdx];
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (termHistoryIdx > 0) {
        termHistoryIdx--;
        termInput.value = termHistory[termHistoryIdx];
      } else {
        termHistoryIdx = -1;
        termInput.value = "";
      }
    }
  });

  document.getElementById("btn-term-clear").addEventListener("click", () => {
    document.getElementById("term-output").innerHTML = "";
  });

  document.getElementById("reports-list").addEventListener("click", e => {
    if (!(e.target instanceof Element)) return;
    const btn = e.target.closest(".report-delete-btn");
    if (!btn) return;
    deleteReport(btn.dataset.report);
  });

  // Quick action buttons
  document.querySelectorAll(".term-action").forEach(btn => {
    btn.addEventListener("click", () => {
      const cmd = btn.dataset.cmd;
      termInput.value = cmd;
      termInput.focus();
      // Auto-run commands that don't need arguments
      if (cmd === "list-sources" || cmd === "help") {
        termInput.value = "";
        termExec(cmd);
      }
    });
  });

  loadSources();
});
