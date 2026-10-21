/**
 * Penligent — scanner models.
 *
 * Reconstructed from the reference application's `ipc/scanner/model.cjs`. These
 * are the record shapes the scanner and the crawler produce.
 */

/** A crawled request. */
const crawlerResult = {
  url: "",
  method: "GET",
  req_headers: null,
  req_data: "",
  has_param: false,
  source: "Target",
  parent_url: "",
  is_relative: false
};

/** A single HTTP exchange captured while crawling. */
const httpResult = {
  url: "",
  method: "GET",
  req_headers: null,
  req_data: "",
  status_code: 0,
  resp_headers: {},
  resp_data: "",
  error: undefined
};

/** A scanner finding (xray's JSON output shape). */
const scannerResult = {
  create_time: 0,
  detail: {
    addr: "",
    payload: "",
    snapshot: [],
    extra: {
      param: {}
    }
  },
  plugin: "",
  target: {
    url: ""
  }
};

/** A scanner finding flattened for the `scan_result` table. */
const scanResult = {
  targetUrl: "",
  vulnerableUrl: "",
  pluginName: "",
  vulnerabilityType: "",
  riskLevel: "low",
  payload: "",
  requestData: "",
  responseData: "",
  vulnerableParams: {}
};

module.exports = { crawlerResult, httpResult, scannerResult, scanResult };
