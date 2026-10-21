const { ipcMain } = require("electron");
const dns = require("dns").promises;
const net = require("net");
const os = require("os");

/**
 * The target tools.
 *
 * The reference ships these as a set of small utilities the agent calls to
 * check a target before testing it: what kind of input it is, what it
 * resolves to, what listens on it, and which of its subdomains answer.
 *
 * The shapes below are the reference's own.
 */

/** The services the port scanner recognises. */
const SERVICES = {
  21: "ftp",
  22: "ssh",
  23: "telnet",
  25: "smtp",
  53: "dns",
  80: "http",
  110: "pop3",
  143: "imap",
  443: "https",
  445: "smb",
  3306: "mysql",
  3389: "rdp",
  5432: "postgresql",
  6379: "redis",
  8080: "http-proxy",
  8443: "https-alt",
  9000: "php-fpm",
  9200: "elasticsearch",
  27017: "mongodb"
};

/** The ports the scanner tries when the caller does not say. */
const DEFAULT_PORTS = [
  21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 3306, 3389, 5432, 6379, 8080, 8443
];

/** The subdomains the scanner looks for. */
const SUBDOMAIN_WORDS = [
  "www", "mail", "ftp", "dev", "test", "api", "admin", "portal", "m", "blog",
  "shop", "stage", "cdn", "static", "app", "beta", "git", "jenkins", "sonar",
  "vpn", "db", "mysql", "redis", "nagios", "grafana", "kibana", "gitlab"
];

/** Whether a port accepts a connection. */
function probePort(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

/**
 * What kind of input this is.
 *
 * The reference answers `{ type, input, valid, version }`, where the type is
 * "ip", "domain" or "invalid".
 */
ipcMain.handle("detect-input-type", async (_event, input) => {
  const value = String(input ?? "").trim();
  if (net.isIP(value)) {
    return {
      type: "ip",
      input: value,
      valid: true,
      version: net.isIP(value) === 4 ? "IPv4" : "IPv6"
    };
  }
  const domain = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i.test(value);
  return {
    type: domain ? "domain" : "invalid",
    input: value,
    valid: domain,
    version: ""
  };
});

/** What a hostname resolves to. */
ipcMain.handle("resolve-hostname", async (_event, input) => {
  const value = String(input ?? "").trim();
  try {
    const addresses = await dns.lookup(value, { all: true, verbatim: true });
    return {
      success: true,
      input: value,
      ipv4: addresses.find((entry) => entry.family === 4)?.address || "",
      ipv6: addresses.find((entry) => entry.family === 6)?.address || "",
      all: addresses.map((entry) => entry.address)
    };
  } catch (error) {
    return { success: false, input: value, ipv4: "", ipv6: "", all: [], error: error.message };
  }
});

/** What an address resolves back to. */
ipcMain.handle("reverse-ip", async (_event, input) => {
  const value = String(input ?? "").trim();
  try {
    const hostnames = await dns.reverse(value);
    return {
      success: true,
      input: value,
      hostnames,
      primary: hostnames[0] || ""
    };
  } catch (error) {
    return { success: false, input: value, hostnames: [], primary: "", error: error.message };
  }
});

/** Which of the ports accept a connection. */
ipcMain.handle("scan-ports", async (_event, host, ports) => {
  const value = String(host ?? "").trim();
  const list = Array.isArray(ports) && ports.length ? ports : DEFAULT_PORTS;
  const openPorts = [];
  for (const port of list) {
    if (await probePort(value, port)) {
      openPorts.push({ port: Number(port), service: SERVICES[port] || "unknown" });
    }
  }
  return {
    success: openPorts.length > 0,
    host: value,
    open: openPorts.length > 0,
    openPorts
  };
});

/** Which of the common subdomains answer. */
ipcMain.handle("scan-subdomains", async (_event, domain) => {
  const value = String(domain ?? "").trim();
  const subdomains = [];
  for (const word of SUBDOMAIN_WORDS) {
    const candidate = `${word}.${value}`;
    try {
      const addresses = await dns.lookup(candidate, { all: true, verbatim: true });
      if (!addresses.length) continue;
      subdomains.push({
        subdomain: candidate,
        protocol: addresses[0].family === 4 ? "ipv4" : "ipv6",
        statusCode: "",
        ip: addresses[0].address
      });
    } catch {
      /* this name does not resolve */
    }
  }
  return {
    success: subdomains.length > 0,
    domain: value,
    found: subdomains.length > 0,
    subdomains
  };
});

/** Whether an address is usable. */
ipcMain.handle("check-ip", async (_event, input) => {
  const value = String(input ?? "").trim();
  if (!net.isIP(value)) {
    return { success: false, input: value, message: "Not a valid IP address" };
  }
  const local = net.isIP(value) === 4 && value.startsWith("127.");
  return {
    success: true,
    input: value,
    message: local ? "Loopback address" : "Valid IP address"
  };
});

/** Whether a domain resolves. */
ipcMain.handle("check-domain", async (_event, input) => {
  const value = String(input ?? "").trim();
  try {
    const addresses = await dns.lookup(value, { all: true, verbatim: true });
    if (!addresses.length) {
      return { success: false, input: value, message: "No records found" };
    }
    return {
      success: true,
      input: value,
      message: "Domain resolves",
      records: addresses.map((entry) => ({ type: entry.family === 4 ? "A" : "AAAA", value: entry.address }))
    };
  } catch {
    return { success: false, input: value, message: "No records found" };
  }
});

/** Whether a path looks sensitive. */
ipcMain.handle("check-sensitive-path", async (_event, input) => {
  const value = String(input ?? "").trim();
  const sensitive = [
    "/admin", "/.env", "/.git", "/config", "/backup", "/dump", "/phpinfo",
    "/server-status", "/wp-admin", "/actuator", "/.aws", "/id_rsa", "/shell"
  ];
  const found = sensitive.filter((candidate) => value.includes(candidate));
  return {
    success: true,
    input: value,
    message: found.length ? `Sensitive path: ${found.join(", ")}` : "No sensitive path detected",
    sensitive: found.length > 0
  };
});

module.exports = { SERVICES, DEFAULT_PORTS, SUBDOMAIN_WORDS };
