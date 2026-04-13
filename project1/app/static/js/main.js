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
  compareSourceA: null,
  compareFileA: null,
  compareSourceB: null,
  compareFileB: null,
};

// ---------------------------------------------------------------------------
// Chart instances
// ---------------------------------------------------------------------------
let waveformChart = null;
let fftChart = null;
let metricsChart = null;
let compareWaveformChart = null;
let compareDiffChart = null;
let compareFftChart = null;

const CHART_DEFAULTS = {
  animation: false,
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: "#e0e3f0", font: { size: 11 } } } },
  scales: {
    x: { ticks: { color: "#737897", maxTicksLimit: 10 }, grid: { color: "#2e3147" } },
    y: { ticks: { color: "#737897" }, grid: { color: "#2e3147" } },
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
  bar.style.color = isError ? "var(--accent2)" : "var(--text-muted)";
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
        x: { ...CHART_DEFAULTS.scales.x, title: { display: true, text: "Time (s)", color: "#737897" } },
        y: { ...CHART_DEFAULTS.scales.y, title: { display: true, text: data.units || "Amplitude", color: "#737897" } },
      },
    },
  });
}

function renderFftChart() {
  // Use the already-loaded downsampled waveform data — no extra request needed
  if (!state.currentWaveformData) return;
  const samples = state.currentWaveformData.samples;
  const sampleRate = state.currentWaveformData.sample_rate;
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
        x: { ...CHART_DEFAULTS.scales.x, title: { display: true, text: "Frequency (Hz)", color: "#737897" } },
        y: { ...CHART_DEFAULTS.scales.y, title: { display: true, text: "Magnitude", color: "#737897" } },
      },
    },
  });
}

function renderMetricTiles(waveformData) {
  const grid = document.getElementById("metrics-tiles");
  const src = state.selectedSource;
  const fname = waveformData.filename;

  // Fetch scalar metrics from CSV history
  apiFetch(`/api/sources/${src}/metrics`).then(data => {
    const row = data.metrics.find(r => r.filename === fname);
    if (!row) return;

    const tiles = [
      { label: "Peak-to-Peak", value: parseFloat(row.peak_to_peak).toFixed(5) },
      { label: "RMS", value: parseFloat(row.rms).toFixed(5) },
      { label: "Mean", value: parseFloat(row.mean).toFixed(5) },
      { label: "Std Dev", value: parseFloat(row.std).toFixed(5) },
      { label: "SNR (dB)", value: row.snr_db !== "None" ? parseFloat(row.snr_db).toFixed(2) : "N/A" },
      { label: "Dom. Freq (Hz)", value: parseFloat(row.dominant_freq_hz).toFixed(2) },
      { label: "Samples", value: parseInt(row.num_samples).toLocaleString() },
      { label: "Sample Rate", value: `${waveformData.sample_rate} Hz` },
    ];

    grid.innerHTML = tiles.map(t => `
      <div class="metric-tile">
        <div class="label">${t.label}</div>
        <div class="value">${t.value}</div>
      </div>
    `).join("");
  }).catch(() => {});
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
          title: { display: true, text: "Select a source to view metrics trend", color: "#737897" },
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
        x:     { ...CHART_DEFAULTS.scales.x, title: { display: true, text: "Capture", color: "#737897" } },
        y:     { ...CHART_DEFAULTS.scales.y, position: "left",  title: { display: true, text: "Amplitude", color: "#737897" }, beginAtZero: true },
        yFreq: { ...CHART_DEFAULTS.scales.y, position: "right", title: { display: true, text: "Frequency (Hz)", color: "#f7d24f" },
                 grid: { drawOnChartArea: false }, beginAtZero: true },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Comparison tab
// ---------------------------------------------------------------------------
async function populateCompareSelectors() {
  const sources = state.sources;
  ["compare-source-a", "compare-source-b"].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = '<option value="">-- Select Source --</option>';
    sources.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);
    });
  });
}

async function onCompareSourceChange(sourceId, fileSelectorId) {
  const sel = document.getElementById(fileSelectorId);
  sel.innerHTML = '<option value="">-- Select File --</option>';
  if (!sourceId) return;
  try {
    const data = await apiFetch(`/api/sources/${sourceId}/waveforms`);
    (data.waveforms || []).forEach(f => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.warn(e);
  }
}

async function runComparison() {
  const sourceA = document.getElementById("compare-source-a").value;
  const fileA = document.getElementById("compare-file-a").value;
  const sourceB = document.getElementById("compare-source-b").value;
  const fileB = document.getElementById("compare-file-b").value;

  if (!sourceA || !fileA || !sourceB || !fileB) {
    setStatus("Select both waveforms to compare.", true);
    return;
  }

  setStatus("Running comparison…");
  try {
    const result = await apiFetch("/api/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_a: sourceA, filename_a: fileA, source_b: sourceB, filename_b: fileB }),
    });
    renderComparisonResult(result);
    setStatus(`Comparison complete — RMSE: ${result.rmse.toFixed(6)}, Correlation: ${result.correlation.toFixed(4)}`);
  } catch (e) {
    setStatus(`Comparison error: ${e.message}`, true);
  }
}

function findOnset(samples) {
  // Find the first index where the signal becomes meaningfully active.
  // Uses a rolling window of 10 points, threshold at 30% of peak absolute value.
  const peak = Math.max(...samples.map(s => Math.abs(s)));
  if (peak === 0) return 0;
  const threshold = peak * 0.3;
  const window = 10;
  for (let i = 0; i < samples.length - window; i++) {
    const rms = Math.sqrt(samples.slice(i, i + window).reduce((s, v) => s + v * v, 0) / window);
    if (rms > threshold) return Math.max(0, i);
  }
  return 0;
}

function renderComparisonResult(result) {
  // Summary metrics
  document.getElementById("cmp-rmse").textContent = result.rmse.toFixed(6);
  document.getElementById("cmp-correlation").textContent = result.correlation.toFixed(4);
  document.getElementById("cmp-lag").textContent = result.alignment_lag_samples;

  // Degradation indicators
  const degList = document.getElementById("degradation-list");
  if (result.degradation_indicators && result.degradation_indicators.length > 0) {
    degList.innerHTML = result.degradation_indicators.map(d => `<li>${d}</li>`).join("");
  } else {
    degList.innerHTML = '<li class="no-degradation" style="list-style:none;background:none;border:none;color:var(--green)">✓ No degradation indicators detected.</li>';
  }

  // Waveform overlay chart — shift one dataset with leading nulls so both
  // active portions start at the same x position, then slice both to the
  // shared onset so the blank leading region doesn't compress the active view.
  const onsetA = findOnset(result.waveform_a);
  const onsetB = findOnset(result.waveform_b);
  const shift = onsetB - onsetA;
  let dataA = result.waveform_a;
  let dataB = result.waveform_b;
  if (shift > 0) {
    dataA = Array(shift).fill(null).concat(result.waveform_a);
  } else if (shift < 0) {
    dataB = Array(-shift).fill(null).concat(result.waveform_b);
  }
  // Trim both to start just before the shared onset so the chart isn't
  // dominated by blank/null leading space.
  const sharedOnset = Math.max(onsetA, onsetB);
  const trimStart = Math.max(0, sharedOnset - 10);
  dataA = dataA.slice(trimStart);
  dataB = dataB.slice(trimStart);
  const totalLen = Math.max(dataA.length, dataB.length);

  const ctxW = document.getElementById("compare-waveform-chart").getContext("2d");
  if (compareWaveformChart) compareWaveformChart.destroy();
  const labels = Array.from({ length: totalLen }, (_, i) => i);
  compareWaveformChart = new Chart(ctxW, {
    type: "line",
    data: {
      labels,
      datasets: [
        makeLineDataset(result.label_a, dataA, "#4f8ef7"),
        makeLineDataset(result.label_b, dataB, "#f76b4f"),
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { ...CHART_DEFAULTS.scales.x, title: { display: true, text: "Sample", color: "#737897" } },
        y: { ...CHART_DEFAULTS.scales.y, title: { display: true, text: "Amplitude", color: "#737897" } },
      },
    },
  });

  // Difference chart
  const ctxD = document.getElementById("compare-diff-chart").getContext("2d");
  if (compareDiffChart) compareDiffChart.destroy();
  const diffLabels = Array.from({ length: result.difference.length }, (_, i) => i);
  compareDiffChart = new Chart(ctxD, {
    type: "line",
    data: {
      labels: diffLabels,
      datasets: [makeLineDataset("A − B (aligned)", result.difference, "#f7d24f")],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { ...CHART_DEFAULTS.scales.x, title: { display: true, text: "Sample", color: "#737897" } },
        y: { ...CHART_DEFAULTS.scales.y, title: { display: true, text: "Difference", color: "#737897" } },
      },
    },
  });

  // FFT overlay
  const ctxF = document.getElementById("compare-fft-chart").getContext("2d");
  if (compareFftChart) compareFftChart.destroy();
  compareFftChart = new Chart(ctxF, {
    type: "line",
    data: {
      labels: result.fft_a.freqs.map(f => f.toFixed(1)),
      datasets: [
        makeLineDataset(`FFT ${result.label_a}`, result.fft_a.magnitudes, "#4f8ef7"),
        makeLineDataset(`FFT ${result.label_b}`, result.fft_b.magnitudes, "#f76b4f"),
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { ...CHART_DEFAULTS.scales.x, title: { display: true, text: "Frequency (Hz)", color: "#737897" } },
        y: { ...CHART_DEFAULTS.scales.y, title: { display: true, text: "Magnitude", color: "#737897" } },
      },
    },
  });
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
      `<li><a href="/api/reports/${r}" target="_blank">${r}</a></li>`
    ).join("")}</ul>`;
  } catch (e) {
    setStatus(`Error loading reports: ${e.message}`, true);
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
  if (tabId === "tab-compare") populateCompareSelectors();
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

  // Compare source selectors
  document.getElementById("compare-source-a").addEventListener("change", e =>
    onCompareSourceChange(e.target.value, "compare-file-a")
  );
  document.getElementById("compare-source-b").addEventListener("change", e =>
    onCompareSourceChange(e.target.value, "compare-file-b")
  );

  document.getElementById("btn-run-compare").addEventListener("click", runComparison);
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
