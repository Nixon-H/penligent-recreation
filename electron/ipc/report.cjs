/**
 * Penligent — report generation.
 *
 * The reference asks Penligent's service to render the report:
 *
 *     POST /api/agent/report-export/v1/messages
 *     { task_id, model, project_id, language,
 *       risk_list: JSON.stringify(riskList),
 *       current_target_info: JSON.stringify(overview),
 *       test_list: JSON.stringify(nowTestList) }
 *
 * ... and stores the returned markdown through
 * `updateReportExportContentFormatStatus(id, content, "md", "completed")`.
 *
 * Every input the server receives is assembled **client-side**, so the same
 * report can be produced locally. This module renders the report from exactly
 * the same payload the reference sends, and the result is stored in
 * `report_exports` through exactly the same call the reference makes.
 */
const { ipcMain } = require("electron");
const { build } = require("../db/db.cjs");

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

function parseMaybe(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function heading(text) {
  return `\n## ${text}\n`;
}

function tableRow(cells) {
  return `| ${cells.join(" | ")} |`;
}

/**
 * Render the penetration-test report.
 *
 * @param {object} payload
 * @param {number} payload.projectId
 * @param {object} payload.project       the project row
 * @param {Array}  payload.riskList     the findings
 * @param {object} payload.targetInfo   the scanned target overview
 * @param {Array}  payload.testList     the test plan
 * @param {string} payload.language
 */
function renderReport(payload) {
  const {
    project,
    riskList = [],
    targetInfo = {},
    testList = [],
    language = "en"
  } = payload;

  const risks = Array.isArray(riskList) ? riskList : [];
  const target = parseMaybe(targetInfo) || {};
  const plan = parseMaybe(testList) || [];

  const lines = [];
  lines.push(`# Penetration Test Report — ${project?.project_name || "Untitled project"}`);
  lines.push("");
  lines.push(`- **Generated**: ${new Date().toISOString()}`);
  lines.push(`- **Project ID**: ${payload.projectId ?? "—"}`);
  if (project?.project_description) {
    lines.push(`- **Scope**: ${project.project_description}`);
  }
  lines.push(`- **Language**: ${language}`);

  /* --- Target information --------------------------------------------- */
  if (Object.keys(target).length) {
    lines.push(heading("Target Information"));
    lines.push(tableRow(["Field", "Value"]));
    lines.push(tableRow(["---", "---"]));
    for (const [key, value] of Object.entries(target)) {
      lines.push(
        tableRow([
          String(key).replace(/_/g, " "),
          typeof value === "object" ? JSON.stringify(value) : String(value ?? "")
        ])
      );
    }
  }

  /* --- Summary --------------------------------------------------------- */
  const counts = {};
  for (const risk of risks) {
    const severity = String(risk.severity || "info").toLowerCase();
    counts[severity] = (counts[severity] || 0) + 1;
  }
  lines.push(heading("Summary"));
  lines.push(`Total findings: **${risks.length}**`);
  for (const severity of SEVERITY_ORDER) {
    if (counts[severity]) lines.push(`- ${severity}: ${counts[severity]}`);
  }

  /* --- Findings --------------------------------------------------------- */
  if (risks.length) {
    lines.push(heading("Findings"));
    const ordered = [...risks].sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(String(a.severity || "info").toLowerCase()) -
        SEVERITY_ORDER.indexOf(String(b.severity || "info").toLowerCase())
    );
    for (const [index, risk] of ordered.entries()) {
      lines.push(`### ${index + 1}. ${risk.title || "Untitled finding"}`);
      lines.push("");
      lines.push(`- **Severity**: ${risk.severity || "info"}`);
      if (risk.risk_type) lines.push(`- **Type**: ${risk.risk_type}`);
      if (risk.affected_target) lines.push(`- **Affected target**: ${risk.affected_target}`);
      if (risk.cve_id) lines.push(`- **CVE**: ${risk.cve_id}`);
      if (risk.cvss_score !== undefined && risk.cvss_score !== null) {
        lines.push(`- **CVSS**: ${risk.cvss_score}`);
      }
      if (risk.status) lines.push(`- **Status**: ${risk.status}`);
      if (risk.description) {
        lines.push("");
        lines.push(String(risk.description));
      }
      if (risk.evidence) {
        lines.push("");
        lines.push("**Evidence**");
        lines.push("```");
        lines.push(
          typeof risk.evidence === "string"
            ? risk.evidence
            : JSON.stringify(risk.evidence, null, 2)
        );
        lines.push("```");
      }
      if (risk.recommendation) {
        lines.push("");
        lines.push("**Recommendation**");
        lines.push(String(risk.recommendation));
      }
      lines.push("");
    }
  }

  /* --- Test plan -------------------------------------------------------- */
  if (Array.isArray(plan) && plan.length) {
    lines.push(heading("Test Plan"));
    lines.push(tableRow(["#", "Phase", "Title", "Status"]));
    lines.push(tableRow(["---", "---", "---", "---"]));
    plan.forEach((item, index) => {
      lines.push(
        tableRow([
          String(item?.id ?? index + 1),
          String(item?.phase ?? ""),
          String(item?.title ?? item?.name ?? ""),
          String(item?.status ?? "todo")
        ])
      );
    });
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    "*Generated locally by Penligent. The reference renders this report with " +
      "Penligent's hosted service; the same inputs are used here.*"
  );
  lines.push("");

  return lines.join("\n");
}

ipcMain.handle("generate-report", async (_event, payload) => {
  const api = build(require("electron").app);
  const projectId = payload?.projectId;

  const projects = api.getProjects();
  const project = projects.find((p) => p.id === projectId) || null;

  const risks = api.getRiskItems(projectId) || [];
  const testList = api.getLatestTestListByProjectId(projectId);
  const overview = project ? { target: project.project_target || "" } : {};

  // The reference creates a "processing" row first, then fills it in.
  const created = api.addReportExport({
    project_id: projectId,
    report_content: "",
    export_format: "md",
    file_path: "",
    file_size: 0,
    export_status: "processing"
  });
  const id = created.lastInsertRowid;

  try {
    const content = renderReport({
      projectId,
      project,
      riskList: risks,
      targetInfo: overview,
      testList: testList?.test_list || [],
      language: payload?.language || "en"
    });
    api.updateReportExportContentFormatStatus(id, content, "md", "completed");
    return { success: true, id, content, size: Buffer.byteLength(content, "utf8") };
  } catch (error) {
    api.updateReportExportContentFormatStatus(id, "", "md", "failed");
    return { success: false, error: error.message };
  }
});

module.exports = { renderReport };
