import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { platform } from "node:os";
import {
  buildAnalyzeStoreReport,
  buildInspectLastPackReport,
  buildMetricsReport,
  buildStatusReport,
  loadInspectionData
} from "./inspection.mjs";

function formatPercent(value) {
  return `${(Number(value ?? 0) * 100).toFixed(1)}%`;
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString("en-US", {
    maximumFractionDigits: 1
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sortedCounts(bucket = {}, limit = 8) {
  return Object.entries(bucket)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return String(left[0]).localeCompare(String(right[0]));
    })
    .slice(0, limit)
    .map(([label, value]) => ({
      label,
      value: Number(value ?? 0)
    }));
}

function recentPromptActivity(audits = [], limit = 8) {
  return audits
    .filter((item) => item.hook_event_name === "UserPromptSubmit")
    .slice()
    .sort((left, right) => String(right.occurred_at ?? "").localeCompare(String(left.occurred_at ?? "")))
    .slice(0, limit)
    .map((item) => ({
      occurred_at: item.occurred_at ?? null,
      session_id: item.session_id ?? null,
      decision_reason: item.decision?.reason ?? "unknown",
      injected: Boolean(item.decision?.inject_context),
      retrieved_count: Number(item.metrics?.retrieved_count ?? 0),
      dropped_count: Number(item.metrics?.dropped_count ?? 0),
      token_savings_estimate: Number(item.metrics?.token_savings_estimate ?? 0),
      top_drop_reasons: sortedCounts(
        (item.pack?.dropped ?? []).reduce((acc, drop) => {
          const key = String(drop.reason ?? "unknown");
          acc[key] = Number(acc[key] ?? 0) + 1;
          return acc;
        }, {}),
        3
      )
    }));
}

function recentLearningSessions(audits = [], limit = 6) {
  return audits
    .filter((item) => item.hook_event_name === "Stop")
    .slice()
    .sort((left, right) => String(right.occurred_at ?? "").localeCompare(String(left.occurred_at ?? "")))
    .slice(0, limit)
    .map((item) => ({
      occurred_at: item.occurred_at ?? null,
      session_id: item.session_id ?? null,
      signals_seen: Number(item.learning?.signals_seen ?? 0),
      rejected_by_quality_policy: Number(item.learning?.rejected_by_quality_policy ?? 0),
      promoted_atoms: Number(item.learning?.promoted_atoms ?? 0),
      promoted_capsule: Boolean(item.learning?.promoted_capsule)
    }));
}

function buildVerdict(metrics) {
  const injectionRate = Number(metrics.prompts?.injection_rate ?? 0);
  const injectedSavings = Number(metrics.prompts?.avg_token_savings_on_injected_prompts ?? 0);
  const emptyRate = Number(metrics.prompts?.empty_pack_rate ?? 0);
  const storeNoiseRate = Number(metrics.store?.noise?.rate ?? 0);

  if (metrics.prompts?.total === 0) {
    return {
      level: "insufficient_data",
      label: "Not enough data yet",
      summary: "Run a few real sessions before judging memory value."
    };
  }

  if (injectionRate >= 0.3 && injectedSavings >= 80 && emptyRate <= 0.7 && storeNoiseRate <= 0.25) {
    return {
      level: "winning",
      label: "Winning",
      summary: "The plugin is injecting often enough and saving meaningful tokens when it does."
    };
  }

  if (injectionRate >= 0.15 && injectedSavings >= 40 && storeNoiseRate <= 0.35) {
    return {
      level: "mixed",
      label: "Mixed",
      summary: "Memory is helping sometimes, but empty packs or store noise still leave value on the table."
    };
  }

  return {
    level: "not_winning",
    label: "Not winning yet",
    summary: "The system is not injecting enough useful memory yet, or the retrieved packs are not saving enough tokens."
  };
}

function renderBreakdownList(items, emptyLabel) {
  if (items.length === 0) {
    return `<li class="empty">${escapeHtml(emptyLabel)}</li>`;
  }

  return items
    .map((item) => `
      <li>
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(formatNumber(item.value))}</strong>
      </li>
    `)
    .join("");
}

export function renderDashboardHtml(report) {
  const promptDropReasons = sortedCounts(report.metrics.prompt_drop_reasons.all, 8);
  const emptyPackReasons = sortedCounts(report.metrics.prompt_drop_reasons.empty_pack, 8);
  const filteredReasons = sortedCounts(report.metrics.learning.filtered_reasons, 8);
  const storeNoiseReasons = sortedCounts({
    ...(report.metrics.store.noise.by_reason.atoms ?? {}),
    ...(report.metrics.store.noise.by_reason.capsules ?? {})
  }, 8);

  const promptRows = report.recent_prompts.map((item) => `
    <tr>
      <td>${escapeHtml(item.occurred_at ?? "n/a")}</td>
      <td>${escapeHtml(item.decision_reason)}</td>
      <td>${item.injected ? "yes" : "no"}</td>
      <td>${escapeHtml(formatNumber(item.token_savings_estimate))}</td>
      <td>${escapeHtml(item.top_drop_reasons.map((reason) => `${reason.label} (${reason.value})`).join(", ") || "none")}</td>
    </tr>
  `).join("");

  const learningRows = report.recent_learning.map((item) => `
    <tr>
      <td>${escapeHtml(item.occurred_at ?? "n/a")}</td>
      <td>${escapeHtml(item.session_id ?? "n/a")}</td>
      <td>${escapeHtml(formatNumber(item.signals_seen))}</td>
      <td>${escapeHtml(formatNumber(item.rejected_by_quality_policy))}</td>
      <td>${escapeHtml(formatNumber(item.promoted_atoms))}</td>
    </tr>
  `).join("");

  const verdictClass = escapeHtml(report.summary.verdict);
  const lastPackIncluded = report.last_pack?.pack?.included?.length ?? 0;
  const lastPackDropped = report.last_pack?.pack?.dropped?.length ?? 0;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>codex-memory observability deck</title>
    <meta name="description" content="Cyberpunk local observability dashboard for codex-memory." />
    <style>
      :root {
        --bg: #0e0e10;
        --surface: #14161a;
        --surface-strong: #1b1d22;
        --surface-alt: #101217;
        --line: #2a2f37;
        --line-strong: #3a414b;
        --text: #f0f0f0;
        --muted: #9da4ad;
        --green: #00ff9f;
        --cyan: #00d7ff;
        --violet: #8f7dff;
        --pink: #ff0080;
        --amber: #ffc857;
        --danger: #ff6b7d;
        --shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
      }

      * { box-sizing: border-box; }

      html {
        background: var(--bg);
      }

      body {
        margin: 0;
        color: var(--text);
        background:
          linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
          linear-gradient(180deg, #0b0c0f 0%, #101116 100%);
        background-size: 24px 24px, 24px 24px, 100% 100%;
        font-family: "IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, monospace;
        min-height: 100vh;
      }

      .console {
        width: min(1360px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 18px 0 28px;
      }

      .topbar,
      .panel,
      .summary-grid,
      .signal-strip {
        background: var(--surface);
        border: 1px solid var(--line);
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 58px;
        padding: 14px 18px;
        box-shadow: var(--shadow);
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .brand-mark {
        width: 12px;
        height: 12px;
        background: var(--green);
        box-shadow: 0 0 12px rgba(0, 255, 159, 0.35);
      }

      .brand-text {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .brand-text strong {
        font-size: 15px;
        font-weight: 600;
      }

      .brand-text span {
        color: var(--muted);
        font-size: 12px;
      }

      .top-meta {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }

      .chip {
        padding: 7px 10px;
        border: 1px solid var(--line-strong);
        background: var(--surface-alt);
        color: var(--muted);
        font-size: 12px;
        border-radius: 8px;
      }

      .chip strong {
        color: var(--text);
        font-weight: 600;
      }

      .chip.verdict {
        color: var(--text);
      }

      .chip.verdict strong {
        margin-left: 6px;
      }

      .chip.verdict.winning {
        border-color: rgba(0, 255, 159, 0.32);
        box-shadow: inset 0 0 0 1px rgba(0, 255, 159, 0.08);
      }

      .chip.verdict.mixed {
        border-color: rgba(255, 200, 87, 0.32);
        box-shadow: inset 0 0 0 1px rgba(255, 200, 87, 0.08);
      }

      .chip.verdict.not_winning {
        border-color: rgba(255, 107, 125, 0.32);
        box-shadow: inset 0 0 0 1px rgba(255, 107, 125, 0.08);
      }

      .chip.verdict.insufficient_data {
        border-color: rgba(0, 215, 255, 0.3);
      }

      .summary-grid,
      .frame,
      .stats-grid,
      .panel-grid,
      .two-column {
        display: grid;
        gap: 12px;
      }

      .summary-grid {
        margin-top: 12px;
        padding: 16px;
        grid-template-columns: minmax(320px, 1.3fr) minmax(320px, 1fr);
      }

      .summary-copy {
        display: grid;
        gap: 10px;
        align-content: start;
      }

      .summary-copy h1 {
        margin: 0;
        font-size: 24px;
        line-height: 1.2;
      }

      .summary-copy p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
        max-width: 60ch;
      }

      .signal-strip {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0;
      }

      .signal-cell {
        padding: 12px 14px;
        border-right: 1px solid var(--line);
      }

      .signal-cell:last-child {
        border-right: 0;
      }

      .signal-cell dt,
      .label {
        color: var(--muted);
        font-size: 12px;
        margin: 0 0 8px;
      }

      .signal-cell dd {
        margin: 0;
        font-size: 18px;
      }

      .signal-cell small {
        display: block;
        margin-top: 6px;
        color: var(--muted);
        font-size: 12px;
      }

      .frame {
        margin-top: 12px;
        grid-template-columns: 260px minmax(0, 1fr);
      }

      .sidebar,
      .main {
        min-width: 0;
      }

      .sidebar {
        display: grid;
        gap: 12px;
      }

      .panel {
        padding: 16px;
        background: var(--surface);
        box-shadow: var(--shadow);
      }

      .panel h2 {
        margin: 0 0 12px;
        font-size: 15px;
      }

      .stack {
        display: grid;
        gap: 8px;
      }

      .kv {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 9px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.04);
      }

      .kv:first-child {
        border-top: 0;
        padding-top: 0;
      }

      .kv span {
        color: var(--muted);
      }

      .kv strong {
        color: var(--text);
        text-align: right;
      }

      .stats-grid {
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }

      .stat {
        padding: 14px;
        border: 1px solid var(--line);
        background: var(--surface-alt);
      }

      .stat .value {
        font-size: 24px;
        line-height: 1.05;
      }

      .stat .note {
        margin-top: 8px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }

      .main {
        display: grid;
        gap: 12px;
      }

      .panel-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .breakdown {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 8px;
      }

      .breakdown li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px;
        border: 1px solid var(--line);
        background: var(--surface-alt);
      }

      .breakdown li.empty {
        justify-content: flex-start;
        color: var(--muted);
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }

      th, td {
        padding: 12px 10px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
      }

      th {
        color: var(--muted);
        font-size: 12px;
        font-weight: 500;
      }

      .accent-green { color: var(--green); }
      .accent-pink { color: var(--pink); }
      .accent-cyan { color: var(--cyan); }
      .accent-amber { color: var(--amber); }
      .accent-danger { color: var(--danger); }

      .terminal-note {
        margin-top: 12px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }

      @media (max-width: 1180px) {
        .summary-grid,
        .frame,
        .panel-grid {
          grid-template-columns: 1fr;
        }

        .stats-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @media (max-width: 760px) {
        .console {
          width: min(100vw - 16px, 100%);
          padding-top: 8px;
          padding-bottom: 16px;
        }

        .topbar {
          padding: 12px;
        }

        .top-meta {
          justify-content: flex-start;
        }

        .signal-strip,
        .stats-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    </style>
  </head>
  <body>
    <main class="console">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark"></span>
          <div class="brand-text">
            <strong>codex-memory observability deck</strong>
            <span>cyberpunk local dashboard built from the real store</span>
          </div>
        </div>
        <div class="top-meta">
          <span class="chip verdict ${verdictClass}">System verdict <strong>${escapeHtml(report.summary.label)}</strong></span>
          <span class="chip">runtime <strong>${escapeHtml(report.status.health)}</strong></span>
          <span class="chip">profile <strong>${escapeHtml(report.status.runtime_profile)}</strong></span>
          <span class="chip">updated <strong>${escapeHtml(report.status.audit.audit_last_updated_at ?? "n/a")}</strong></span>
        </div>
      </header>

      <section class="summary-grid">
        <section class="summary-copy">
          <h1>System verdict</h1>
          <p>${escapeHtml(report.summary.summary)}</p>
        </section>
        <dl class="signal-strip">
          <div class="signal-cell">
            <dt>Hooks</dt>
            <dd class="${report.status.runtime.hooks_enabled ? "accent-green" : "accent-danger"}">${report.status.runtime.hooks_enabled ? "enabled" : "disabled"}</dd>
            <small>memory ${report.status.runtime.memory_enabled ? "on" : "off"}</small>
          </div>
          <div class="signal-cell">
            <dt>Semantic mode</dt>
            <dd class="accent-cyan">${escapeHtml(report.status.runtime.semantic_mode)}</dd>
            <small>learning ${report.status.runtime.learning_enabled ? "on" : "off"}</small>
          </div>
          <div class="signal-cell">
            <dt>Last pack</dt>
            <dd class="accent-violet">${escapeHtml(formatNumber(report.status.metrics.pack_tokens))}</dd>
            <small>tokens in latest pack</small>
          </div>
          <div class="signal-cell">
            <dt>Edges</dt>
            <dd class="${report.metrics.store.edges.zero_edges_visible ? "accent-danger" : "accent-amber"}">${escapeHtml(formatNumber(report.metrics.store.artifacts.edges))}</dd>
            <small>${report.metrics.store.edges.zero_edges_visible ? "graph still at zero" : "graph memory present"}</small>
          </div>
        </dl>
      </section>

      <section class="frame">
        <aside class="sidebar">
          <section class="panel">
            <h2>Runtime</h2>
            <div class="stack">
              <div class="kv"><span>audit records</span><strong>${escapeHtml(formatNumber(report.status.audit.audit_record_count))}</strong></div>
              <div class="kv"><span>events</span><strong>${escapeHtml(formatNumber(report.metrics.store.artifacts.events))}</strong></div>
              <div class="kv"><span>atoms</span><strong>${escapeHtml(formatNumber(report.metrics.store.artifacts.atoms))}</strong></div>
              <div class="kv"><span>capsules</span><strong>${escapeHtml(formatNumber(report.metrics.store.artifacts.capsules))}</strong></div>
            </div>
          </section>

          <section class="panel">
            <h2>Last pack</h2>
            <div class="stack">
              <div class="kv"><span>decision</span><strong>${escapeHtml(report.last_pack.pack.decision_reason)}</strong></div>
              <div class="kv"><span>included</span><strong>${escapeHtml(formatNumber(lastPackIncluded))}</strong></div>
              <div class="kv"><span>dropped</span><strong>${escapeHtml(formatNumber(lastPackDropped))}</strong></div>
              <div class="kv"><span>savings</span><strong>${escapeHtml(formatNumber(report.last_pack.pack.metrics.token_savings_estimate))}</strong></div>
            </div>
          </section>

          <section class="panel">
            <h2>Store drift</h2>
            <div class="stack">
              <div class="kv"><span>detected noise</span><strong class="accent-pink">${escapeHtml(formatNumber(report.metrics.store.noise.detected))}</strong></div>
              <div class="kv"><span>noise rate</span><strong>${escapeHtml(formatPercent(report.metrics.store.noise.rate))}</strong></div>
              <div class="kv"><span>duplicates</span><strong>${escapeHtml(formatNumber(report.metrics.store.duplicates.total))}</strong></div>
              <div class="kv"><span>orphans</span><strong>${escapeHtml(formatNumber(report.metrics.store.orphans.edges))}</strong></div>
            </div>
          </section>
        </aside>

        <section class="main">
          <section class="stats-grid">
            <article class="stat">
              <div class="label">Injection rate</div>
              <div class="value accent-green">${escapeHtml(formatPercent(report.metrics.prompts.injection_rate))}</div>
              <div class="note">${escapeHtml(formatNumber(report.metrics.prompts.injected))} of ${escapeHtml(formatNumber(report.metrics.prompts.total))} prompts injected</div>
            </article>
            <article class="stat">
              <div class="label">Empty pack rate</div>
              <div class="value accent-danger">${escapeHtml(formatPercent(report.metrics.prompts.empty_pack_rate))}</div>
              <div class="note">${escapeHtml(formatNumber(report.metrics.prompts.empty_pack))} prompts ended empty</div>
            </article>
            <article class="stat">
              <div class="label">Avg savings</div>
              <div class="value accent-cyan">${escapeHtml(formatNumber(report.metrics.prompts.avg_token_savings_estimate))}</div>
              <div class="note">all prompts</div>
            </article>
            <article class="stat">
              <div class="label">Injected savings</div>
              <div class="value accent-amber">${escapeHtml(formatNumber(report.metrics.prompts.avg_token_savings_on_injected_prompts))}</div>
              <div class="note">only prompts that injected</div>
            </article>
            <article class="stat">
              <div class="label">Max savings</div>
              <div class="value accent-violet">${escapeHtml(formatNumber(report.metrics.prompts.max_token_savings_estimate))}</div>
              <div class="note">best observed prompt</div>
            </article>
            <article class="stat">
              <div class="label">Retrieved / dropped</div>
              <div class="value">${escapeHtml(formatNumber(report.metrics.aggregates.avg_retrieved_count))} / ${escapeHtml(formatNumber(report.metrics.aggregates.avg_dropped_count))}</div>
              <div class="note">average per prompt</div>
            </article>
          </section>

          <section class="panel-grid">
            <section class="panel">
              <h2>Top drop reasons</h2>
              <ul class="breakdown">
                ${renderBreakdownList(promptDropReasons, "No prompt drop reasons recorded.")}
              </ul>
            </section>

            <section class="panel">
              <h2>Empty pack reasons</h2>
              <ul class="breakdown">
                ${renderBreakdownList(emptyPackReasons, "No empty-pack reasons recorded.")}
              </ul>
            </section>

            <section class="panel">
              <h2>Quality policy filters</h2>
              <ul class="breakdown">
                ${renderBreakdownList(filteredReasons, "No filtered reasons recorded.")}
              </ul>
            </section>

            <section class="panel">
              <h2>Store noise reasons</h2>
              <ul class="breakdown">
                ${renderBreakdownList(storeNoiseReasons, "No store noise detected with the current policy.")}
              </ul>
            </section>
          </section>

          <section class="panel">
            <h2>Recent packs</h2>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Decision</th>
                  <th>Injected</th>
                  <th>Savings</th>
                  <th>Top drop reasons</th>
                </tr>
              </thead>
              <tbody>
                ${promptRows || `<tr><td colspan="5">No prompt audits available.</td></tr>`}
              </tbody>
            </table>
          </section>

          <section class="panel">
            <h2>Recent learning</h2>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Session</th>
                  <th>Signals seen</th>
                  <th>Filtered</th>
                  <th>Promoted atoms</th>
                </tr>
              </thead>
              <tbody>
                ${learningRows || `<tr><td colspan="5">No stop audits available.</td></tr>`}
              </tbody>
            </table>
          </section>
        </section>
      </section>

      <div class="terminal-note">
        Generated from ${escapeHtml(report.store_path)} at ${escapeHtml(report.generated_at)}.
      </div>
    </main>
  </body>
</html>`;
}

export function buildDashboardReport({ storePath, outputPath = null }) {
  const loaded = loadInspectionData({ storePath });
  const status = buildStatusReport({ storePath });
  const metrics = buildMetricsReport({ storePath });
  const analysis = buildAnalyzeStoreReport({ storePath });
  const lastPack = buildInspectLastPackReport({ storePath });
  const summary = buildVerdict(metrics);

  return {
    command: "dashboard",
    store_path: storePath,
    output_path: outputPath,
    generated_at: new Date().toISOString(),
    status,
    metrics,
    analysis,
    last_pack: lastPack,
    summary: {
      verdict: summary.level,
      label: summary.label,
      summary: summary.summary,
      injection_rate: metrics.prompts.injection_rate,
      empty_pack_rate: metrics.prompts.empty_pack_rate,
      avg_token_savings_on_injected_prompts: metrics.prompts.avg_token_savings_on_injected_prompts
    },
    recent_prompts: recentPromptActivity(loaded.audits),
    recent_learning: recentLearningSessions(loaded.audits)
  };
}

export function writeDashboardHtml({ report, outputPath }) {
  const html = renderDashboardHtml(report);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html, "utf8");
  return html;
}

export function openDashboardFile(outputPath) {
  const commands = platform() === "darwin"
    ? [["open", [outputPath]]]
    : platform() === "win32"
      ? [["cmd", ["/c", "start", "", outputPath]]]
      : [["xdg-open", [outputPath]]];

  for (const [command, args] of commands) {
    const result = spawnSync(command, args, { stdio: "ignore" });
    if (result.status === 0) {
      return {
        opened: true,
        command
      };
    }
  }

  return {
    opened: false,
    command: null
  };
}
