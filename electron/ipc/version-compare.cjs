/**
 * Version comparison.
 *
 * Kept free of Electron imports so it can be unit tested under plain Node.
 */

/**
 * Compare two dotted version strings.
 *
 * A positive result means `a` is newer than `b`, a negative result means it
 * is older and zero means they are the same. Non-numeric parts are treated
 * as zero, so "2.1" and "2.1.0" compare equal.
 */
function compareVersions(a, b) {
  const left = String(a || "0").split(/[.\-+]/).map((part) => parseInt(part, 10) || 0);
  const right = String(b || "0").split(/[.\-+]/).map((part) => parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

module.exports = { compareVersions };
