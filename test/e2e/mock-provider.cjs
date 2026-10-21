/**
 * Mock AI providers used to verify the provider layer end to end.
 *
 *   :18080  OpenAI-compatible  POST /v1/chat/completions  (streaming + non-streaming)
 *   :18081  Anthropic          POST /v1/messages          (streaming + non-streaming)
 *
 * The server records the last request it received so the tests can assert
 * that the reconstruction built the right payload, and it exposes it on
 * GET /__last. A model named "mock-nostream" makes the server ignore the
 * `stream` flag and answer with a single JSON document, which is how some
 * OpenAI-compatible servers behave.
 */
const http = require("http");

let lastRequest = null;

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function sse(res, frames) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });
  for (const frame of frames) {
    res.write(`data: ${JSON.stringify(frame)}\n\n`);
  }
  res.write("data: [DONE]\n\n");
  res.end();
}

function lastRequestHandler(res) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(lastRequest ?? null));
}

const openai = http.createServer(async (req, res) => {
  if (req.url === "/__last") return lastRequestHandler(res);
  if (!req.url.startsWith("/v1/chat/completions")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "not found" } }));
    return;
  }
  const body = await readBody(req);
  lastRequest = { family: "openai", headers: req.headers, body };

  const prompt = body.messages?.[body.messages.length - 1]?.content || "";
  const isPlan = /test plan|plan for/i.test(String(prompt));
  const answer = isPlan
    ? JSON.stringify([
        { id: 1, title: "Passive reconnaissance", description: "Map the attack surface", phase: "recon", status: "todo" },
        { id: 2, title: "Authentication review", description: "Test login flows", phase: "auth", status: "todo" },
        { id: 3, title: "Injection testing", description: "Probe for injection flaws", phase: "testing", status: "todo" }
      ])
    : `MOCK-OPENAI answer for: ${String(prompt).slice(0, 60)}`;

  if (body.model === "mock-nostream") {
    // Deliberately ignore `stream: true` and answer with one JSON document.
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: "mock",
        model: body.model,
        choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }]
      })
    );
    return;
  }

  if (body.stream) {
    sse(res, [
      { choices: [{ delta: { content: answer.slice(0, 20) } }] },
      { choices: [{ delta: { content: answer.slice(20) } }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] }
    ]);
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: "mock",
      model: body.model,
      choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    })
  );
});

const anthropic = http.createServer(async (req, res) => {
  if (req.url === "/__last") return lastRequestHandler(res);
  if (!req.url.startsWith("/v1/messages")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "not found" } }));
    return;
  }
  const body = await readBody(req);
  lastRequest = { family: "anthropic", headers: req.headers, body };

  const prompt = body.messages?.[body.messages.length - 1]?.content || "";
  const answer = `MOCK-ANTHROPIC answer for: ${String(prompt).slice(0, 60)}`;

  if (body.stream) {
    sse(res, [
      { type: "message_start", message: { id: "mock", role: "assistant" } },
      { type: "content_block_delta", delta: { type: "text_delta", text: answer.slice(0, 20) } },
      { type: "content_block_delta", delta: { type: "text_delta", text: answer.slice(20) } },
      { type: "message_stop" }
    ]);
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: "mock",
      type: "message",
      role: "assistant",
      model: body.model,
      content: [{ type: "text", text: answer }],
      usage: { input_tokens: 10, output_tokens: 5 }
    })
  );
});

openai.listen(18080, "0.0.0.0", () => console.log("mock openai on :18080"));
anthropic.listen(18081, "0.0.0.0", () => console.log("mock anthropic on :18081"));
