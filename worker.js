// Cloudflare Worker: sits between your GitHub Pages app and the Anthropic API,
// so your API key stays secret (never put it in index.html).
//
// Setup (in the Cloudflare dashboard):
//  1. Workers & Pages -> Create -> Worker -> paste this file -> Deploy
//  2. Settings -> Variables and Secrets -> add a SECRET named ANTHROPIC_API_KEY
//  3. Add a plain variable named ALLOWED_ORIGIN, e.g. https://YOURNAME.github.io
//  4. Copy the worker's URL into API_URL in index.html

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "POST only" }, 405);

    let data;
    try { data = await request.json(); } catch { return json({ error: "Bad request" }, 400); }

    const c = data.character || {};
    const messages = (data.messages || []).slice(-20).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 2000),
    }));
    if (!messages.length || messages[0].role !== "user") {
      return json({ error: "Conversation must start with a user message" }, 400);
    }

    const system =
      `You are ${c.name || "a character"}, a fictional character in a roleplay chat app. ` +
      `${c.tag ? "Tagline: " + c.tag + ". " : ""}` +
      `${c.bio ? "Background: " + c.bio + ". " : ""}` +
      `Stay in character, reply in 1-3 short conversational sentences, and keep the tone flirty and warm.`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5-5",
        max_tokens: 300,
        system,
        messages,
      }),
    });

    if (!r.ok) return json({ error: "Upstream error" }, 502);
    const out = await r.json();
    const reply = (out.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return json({ reply });
  },
};
