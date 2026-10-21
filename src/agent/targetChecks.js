/**
 * The target checks.
 *
 * The reference validates the target before it accepts a project:
 *
 *   - the target has to be a domain or an address, with an optional scheme,
 *     port and path;
 *   - a CIDR block is not a target;
 *   - a target that resolves to a government address has to be cleared
 *     before the run may start.
 *
 * The reference's sensitive check reads the host names of every address in
 * the target and refuses the ones that belong to a government domain.
 */

/** Whether the text is a domain or an address the reference accepts. */
export function isValidTarget(target) {
  const text = String(target || "");
  let valid = false;

  // A domain, with an optional scheme, port and path.
  if (
    /^(?:https?:\/\/)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/.*)?$/.test(
      text
    )
  ) {
    valid = true;
  }

  // An address, with an optional scheme, port and path.
  if (
    /^(?:https?:\/\/)?(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?::\d+)?(?:\/.*)?$/.test(
      text
    )
  ) {
    valid = true;
  }

  // A network is not a target.
  if (/\b(?:(?:25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})\.){3}(?:25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})\/\d{1,2}\b/g.test(text)) {
    valid = false;
  }

  return valid;
}

/**
 * Whether the target is sensitive.
 *
 * The reference collects the domains in the target and the host names its
 * addresses resolve to, and refuses the ones that belong to a government
 * domain.
 */
export async function isSensitiveTarget(target) {
  const text = String(target || "");
  const hosts = [];
  let safe = true;

  try {
    const ipPattern =
      /\b(?:(?:25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})\.){3}(?:25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})\b/g;
    const domainPattern =
      /\b(?:https?:\/\/)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:[a-zA-Z]{2,})(?:\/[^\s]*)?\b/g;

    const domains = text.match(domainPattern);
    const addresses = text.match(ipPattern);
    if (domains) hosts.push(...domains);

    if (addresses) {
      for (const address of addresses) {
        const result = await window.targetToolsAPI?.reverseIP?.(address);
        if (result?.success) hosts.push(...(result.hostnames || []));
      }
    }

    for (const host of hosts) {
      if (host.includes("gov")) {
        safe = false;
        break;
      }
    }
  } catch {
    return true;
  }
  return safe;
}
