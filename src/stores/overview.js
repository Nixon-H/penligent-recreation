import { defineStore } from "pinia";
import { ref, computed } from "vue";

/**
 * The overview store.
 *
 * The reference keeps everything it has learned about the target in the
 * project's `over_view` column as JSON, and both the Target Overview view
 * and the Threat Map read that same document:
 *
 *   {
 *     target: { target, target_type,
 *                location: { geo, cloud_provider, region, asn, subnet },
 *                identifiers: { ips_list, domains_list } },
 *     network: { waf_or_cdn: [], open_ports: [], dns_records: [] },
 *     apis: [ { url, methods: [...], ... } ],
 *     web_app: { web_technologies: [], tls: {...},
 *                 security_http_headers: [], sensitive_paths: [] }
 *   }
 *
 * The reference fills it from Penligent's service. This build has no
 * service, so it fills it from what the local tools actually establish: the
 * crawl and the project's own settings. Fields that need data this build
 * cannot obtain — the geo lookup, the DNS records, the TLS certificate —
 * are left empty rather than invented.
 */
export const useOverviewStore = defineStore("overview", () => {
  const overView = ref({
    update_time: "",
    target: {
      target: "",
      target_type: "",
      location: { geo: "", cloud_provider: "", region: "", asn: "", subnet: "" },
      identifiers: { ips_list: [], domains_list: [] }
    },
    network: {
      open_ports_services: [],
      reverse_dns: [],
      dns_records: [],
      waf_or_cdn: []
    },
    apis: [],
    web_app: {
      web_technologies: [],
      tls: { subject: "", issuer: "", valid_from: "", valid_to: "", fingerprint: "", san: [] },
      security_http_headers: [],
      sensitive_paths: []
    }
  });

  const getTargetInfoStatus = ref(false);

  const target = computed(() => overView.value.target);
  const network = computed(() => overView.value.network);
  const apis = computed(() => overView.value.apis);
  const webApp = computed(() => overView.value.web_app);

  /** Every host the crawl reached, with the port it was reached on. */
  function hostsOf(records) {
    const hosts = new Map();
    for (const record of records || []) {
      let parsed;
      try {
        parsed = new URL(String(record.url || ""));
      } catch {
        continue;
      }
      const host = parsed.hostname;
      if (!host) continue;
      const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
      if (!hosts.has(host)) hosts.set(host, { host, ports: new Set(), protocol: parsed.protocol });
      hosts.get(host).ports.add(port);
    }
    return [...hosts.values()];
  }

  /** Rebuild the overview from the project's crawl results and settings. */
  async function load(projectId) {
    if (!projectId) return overView.value;
    getTargetInfoStatus.value = true;
    try {
      // The reference keeps the document in the project and starts from it.
      const stored = (await window.dbAPI.getProjectOverView?.(projectId)) || null;
      if (stored) overView.value = { ...overView.value, ...stored };
      const records = (await window.dbAPI.getCrawlerResultByProjectId(projectId)) || [];
      const projects = (await window.dbAPI.getProjects()) || [];
      const project = projects.find((row) => row.id === projectId) || {};

      const hosts = hostsOf(records);
      const ips = new Set();
      const domains = new Set();
      for (const entry of hosts) {
        if (/^\d+\.\d+\.\d+\.\d+$/.test(entry.host)) ips.add(entry.host);
        else domains.add(entry.host);
      }

      // The open ports, as far as the crawl established them, grouped by
      // the host they were reached on.
      const openPortsServices = [];
      for (const entry of hosts) {
        const ports = [];
        for (const port of entry.ports) {
          const banner = firstLine(
            (records || []).find((record) => String(record.url || "").includes(`:${port}`))?.response_data
          );
          ports.push({
            port,
            proto: entry.protocol.replace(":", ""),
            state: "open",
            service: serviceFor(port, entry.protocol),
            version: "",
            banner
          });
        }
        openPortsServices.push({ ip: entry.host, ports });
      }

      // The API endpoints the crawl found, with the methods seen on them.
      const apiMap = new Map();
      for (const record of records || []) {
        if (!record.has_param) continue;
        const url = record.url;
        if (!apiMap.has(url)) {
          apiMap.set(url, {
            path: pathOf(url),
            methods: [],
            auth_required: needsAuth(record),
            description: "",
            examples: []
          });
        }
        const entry = apiMap.get(url);
        const method = (record.method || "GET").toUpperCase();
        if (!entry.methods.includes(method)) entry.methods.push(method);
        if (!entry.examples.includes(url)) entry.examples.push(url);
      }

      overView.value = {
        target: {
          target: project.project_target || "",
          target_type: project.testlist_type || project.task_mode || "",
          location: { geo: "", cloud_provider: "", region: "", asn: "", subnet: "" },
          identifiers: { ips_list: [...ips], domains_list: [...domains] }
        },
        network: {
          waf_or_cdn: [],
          open_ports_services: openPortsServices,
          dns_records: [],
          reverse_dns: []
        },
        apis: [...apiMap.values()],
        web_app: {
          web_technologies: [],
          tls: { subject: "", issuer: "", valid_from: "", valid_to: "", fingerprint: "", san: [] },
          security_http_headers: [],
          sensitive_paths: (records || [])
            .filter((record) => record.is_high_value)
            .map((record) => ({ path: record.url, description: "" }))
        }
      };
      overView.value.update_time = new Date().toISOString();
      return overView.value;
    } finally {
      getTargetInfoStatus.value = false;
    }
  }

  /** The path of a URL, as the reference's API entries carry it. */
  function pathOf(url) {
    try {
      const parsed = new URL(String(url));
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return String(url || "");
    }
  }

  function firstLine(text) {
    const value = String(text || "").trim();
    if (!value) return "";
    return value.split("\n")[0].slice(0, 120);
  }

  function serviceFor(port, protocol) {
    const known = { 80: "http", 443: "https", 22: "ssh", 21: "ftp", 25: "smtp", 8080: "http-alt" };
    return known[port] || (protocol === "https:" ? "https" : "http");
  }

  function needsAuth(record) {
    return /authorization|cookie|token/i.test(String(record.req_headers || ""));
  }

  /**
   * Merge a document into the stored overview.
   *
   * The reference keeps the document in the project's `over_view` column and
   * merges into it, so a second pass adds to what the first one found.
   */
  async function updateOverview(projectId, doc) {
    if (!projectId || !doc) return overView.value;
    const merged = { ...overView.value, ...doc };
    overView.value = merged;
    await window.dbAPI.updateProjectOverView?.(projectId, JSON.stringify(merged));
    return merged;
  }

  /** Start the document over. */
  function clearOverview() {
    overView.value = {
      update_time: "",
      target: {
        target: "",
        target_type: "",
        location: { geo: "", cloud_provider: "", region: "", asn: "", subnet: "" },
        identifiers: { ips_list: [], domains_list: [] }
      },
      network: {
        open_ports_services: [],
        reverse_dns: [],
        dns_records: [],
        waf_or_cdn: []
      },
      apis: [],
      web_app: {
        web_technologies: [],
        tls: { subject: "", issuer: "", valid_from: "", valid_to: "", fingerprint: "", san: [] },
        security_http_headers: [],
        sensitive_paths: []
      }
    };
    getTargetInfoStatus.value = false;
    return overView.value;
  }

  return {
    overView,
    getTargetInfoStatus,
    target,
    network,
    apis,
    webApp,
    load,
    updateOverview,
    clearOverview
  };
});
