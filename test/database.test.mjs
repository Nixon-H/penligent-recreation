import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every statement in the database layer.
 *
 * `better-sqlite3` refuses a call whose arguments do not match the
 * statement's placeholders, so a mismatch is a runtime failure — and the
 * failure happens where the row is written, long after the mistake was
 * made. This test reads the statements and checks the counts.
 */
function statements(source) {
  const found = [];
  // Only `run(...)` is checked: a `prepare` is called separately, and its
  // arguments are supplied when the statement is run.
  const pattern = /\brun\s*\(/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    // The call's arguments, read from the opening parenthesis.
    const start = match.index + match[0].length;
    const call = readCall(source, start);
    if (!call) continue;
    const [sql, rest] = call;
    if (!/^(SELECT|INSERT|UPDATE|DELETE)/i.test(sql)) continue;
    const placeholders = (sql.match(/\?/g) || []).length;
    const args = splitArguments(rest);
    found.push({ sql: sql.replace(/\s+/g, " ").trim(), placeholders, args });
  }
  return found;
}

/**
 * Reads a call's first argument — the SQL — and the text of the rest.
 *
 * The text is scanned with the bracket depth tracked, so a comma inside a
 * nested call or a string does not end the argument.
 */
function readCall(source, start) {
  let i = start;
  let depth = 0;
  let quote = null;
  let sql = null;
  let sqlEnd = -1;
  let argStart = -1;

  while (i < source.length) {
    const ch = source[i];
    if (quote) {
      if (ch === quote && source[i - 1] !== "\\") quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      if (sql === null && depth === 0) {
        // The statement itself.
        const end = source.indexOf(ch, i + 1);
        if (end === -1) return null;
        sql = source.slice(i + 1, end);
        sqlEnd = end + 1;
        i = end + 1;
        continue;
      }
      quote = ch;
      i += 1;
      continue;
    }
    if ("([{".includes(ch)) depth += 1;
    if (")]}".includes(ch)) {
      if (depth === 0) {
        if (sql === null) return null;
        return [sql, source.slice(argStart === -1 ? sqlEnd : argStart, i)];
      }
      depth -= 1;
    }
    if (ch === "," && depth === 0 && sql !== null && argStart === -1) {
      argStart = i + 1;
    }
    i += 1;
  }
  return null;
}

/** Splits a call's argument list at the top-level commas. */
function splitArguments(text) {
  const trimmed = text.replace(/^\s*,/, "").trim();
  if (!trimmed) return [];
  const args = [];
  let depth = 0;
  let current = "";
  let quote = null;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (quote) {
      current += ch;
      if (ch === quote && trimmed[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if ("([{".includes(ch)) depth += 1;
    if (")]}".includes(ch)) depth -= 1;
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

describe("the database layer", () => {
  const source = readFileSync(join(root, "electron", "db", "db.cjs"), "utf8");
  const all = statements(source);

  it("checks every statement that runs", () => {
    assert.ok(all.length > 20, `only ${all.length} statements were found`);
  });

  it("passes as many arguments as every statement has placeholders", () => {
    const wrong = all.filter((s) => s.placeholders !== s.args.length);
    assert.deepEqual(
      wrong.map((s) => ({
        sql: s.sql.slice(0, 90),
        placeholders: s.placeholders,
        arguments: s.args.length
      })),
      [],
      `${wrong.length} of ${all.length} statements have a parameter count that ` +
        `does not match their placeholders — better-sqlite3 rejects those at ` +
        `run time`
    );
  });

  it("writes the risk item's three added columns", () => {
    const insert = all.find((s) => s.sql.includes("INSERT INTO risk_items"));
    assert.ok(insert, "the risk item's insert was not found");
    for (const column of ["like_status", "verify_status", "verify_context"]) {
      assert.ok(
        insert.sql.includes(column),
        `the risk item's insert does not carry ${column}`
      );
    }
  });

  it("reads the projects without a user filter when there is no account", () => {
    // The reference reads the projects of the signed-in user; this build has
    // no account, so the filter must not be applied blindly.
    assert.ok(
      /getProjects:\s*\(userName\)/.test(source),
      "getProjects does not take the user name"
    );
    assert.ok(
      !/SELECT \* FROM projects WHERE user_name = \? ORDER BY updated_at DESC",\s*\n?\s*this\./.test(
        source
      ),
      "getProjects still binds an undefined user name"
    );
  });
});
