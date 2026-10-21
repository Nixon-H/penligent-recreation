/**
 * Penligent — crawler and scan result repository.
 *
 * Reconstructed from the reference application's `db/crawlerRepo.cjs`. The
 * reference's prepared statements are reproduced exactly, including the
 * `is_high_value` column that the reference adds through a migration.
 */
const { getDatabase } = require("./db.cjs");

/** Insert one crawled request. */
function addCrawlerResult(record) {
  const db = getDatabase();
  const statement = db.prepare(`
        INSERT INTO crawler_result (
            project_id,
            url,
            method,
            req_headers,
            req_data,
            has_param,
            is_high_value,
            source,
            is_relative
        ) VALUES (
            @project_id,
            @url,
            @method,
            @req_headers,
            @req_data,
            @has_param,
            @is_high_value,
            @source,
            @is_relative
        )
    `);
  return statement.run({
    project_id: record.projectId,
    url: record.url,
    method: record.method,
    req_headers: record.req_headers,
    req_data: record.req_data,
    has_param: record.has_param ? 1 : 0,
    is_high_value: record.isHighValue ? 1 : 0,
    source: record.source,
    is_relative: record.is_relative ? 1 : 0
  });
}

/** Insert one scanner finding. */
function addScanResult(record) {
  const db = getDatabase();
  const statement = db.prepare(`
        INSERT INTO scan_result (
            project_id,
            req_id,
            target_url,
            vulnerable_url,
            vulnerability_type,
            risk_level,
            payload,
            request_data,
            response_data,
            vulnerable_params
        ) VALUES (
            @project_id,
            @req_id,
            @target_url,
            @vulnerable_url,
            @vulnerability_type,
            @risk_level,
            @payload,
            @request_data,
            @response_data,
            @vulnerable_params
        )
    `);
  return statement.run({
    project_id: record.projectId,
    req_id: record.reqId,
    target_url: record.targetUrl,
    vulnerable_url: record.vulnerableUrl,
    vulnerability_type: record.vulnerabilityType,
    risk_level: record.riskLevel || "low",
    payload: record.payload || "",
    request_data: record.requestData || "",
    response_data: record.responseData || "",
    vulnerable_params:
      typeof record.vulnerableParams === "object"
        ? JSON.stringify(record.vulnerableParams)
        : record.vulnerableParams || "{}"
  });
}

module.exports = { addCrawlerResult, addScanResult };
