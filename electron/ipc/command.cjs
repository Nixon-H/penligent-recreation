/**
 * Penligent — shell command execution IPC handlers.
 *
 * The reference builds an augmented PATH (adding /usr/local/bin, /opt/homebrew/bin,
 * ~/go/bin, ~/.local/bin, /usr/bin, /bin, /usr/sbin, /sbin, /snap/bin) before
 * spawning, and streams stdout/stderr back to the renderer over the
 * "command-data" channel. Executed commands are recorded in
 * execution_results.
 */
const { ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const running = new Map();

function augmentedEnv() {
  const home = os.homedir();
  return {
    ...process.env,
    PATH: [
      "/usr/local/bin",
      "/opt/homebrew/bin",
      path.join(home, "go/bin"),
      path.join(home, ".local/bin"),
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
      "/snap/bin",
      process.env.PATH || ""
    ].join(":"),
    USER: process.env.USER || path.basename(home),
    LANG: process.env.LANG || "en_US.UTF-8"
  };
}

ipcMain.handle("execute-command", (event, options) => {
  const {
    command,
    cwd,
    commandId = `cmd-${Date.now()}`,
    onData
  } = options || {};

  if (!command) return { success: false, error: "missing command" };

  const child = spawn(command, {
    shell: true,
    cwd: cwd || os.homedir(),
    env: augmentedEnv()
  });

  running.set(commandId, child);

  const emit = (chunk) => {
    if (event.sender.isDestroyed()) return;
    // Buffers do not survive the IPC serialiser as text — send a string.
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    event.sender.send("command-data", { commandId, chunk: text, type: "data" });
  };
  child.stdout.on("data", emit);
  child.stderr.on("data", emit);

  child.on("close", (code) => {
    running.delete(commandId);
    if (event.sender.isDestroyed()) return;
    event.sender.send("command-data", {
      commandId,
      chunk: `\n[exit code: ${code}]`,
      type: "end",
      code
    });
  });

  void onData;
  return { success: true, commandId };
});

ipcMain.handle("execute-command-non-streaming", async (_event, options) => {
  const { command, cwd, timeout = 120000 } = options || {};
  if (!command) return { success: false, error: "missing command" };

  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      cwd: cwd || os.homedir(),
      env: augmentedEnv()
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, code, stdout, stderr });
    });
  });
});

ipcMain.handle("stop-command", (_event, commandId) => {
  const child = running.get(commandId);
  if (!child) return { success: false };
  child.kill("SIGTERM");
  running.delete(commandId);
  return { success: true };
});
