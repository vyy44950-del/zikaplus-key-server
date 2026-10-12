function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

function randomKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "ZIKA-" + Array.from(bytes, b => chars[b % chars.length]).join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      });
    }

    if (url.pathname === "/") {
      return new Response("ZikaPlus Key Server is running");
    }

    if (url.pathname === "/admin/create" && request.method === "POST") {
      if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`) {
        return json({ error: "Unauthorized" }, 401);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const days = Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > 3650) {
        return json({ error: "days must be between 1 and 3650" }, 400);
      }

      const key = randomKey();
      const record = {
        expiresAt: Date.now() + days * 86400000,
        deviceId: null,
        createdAt: Date.now()
      };

      await env.KEY_STORE.put(key, JSON.stringify(record));
      return json({ key, days, expiresAt: record.expiresAt });
    }

    if (url.pathname === "/activate" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const key = String(body.key || "").trim();
      const deviceId = String(body.deviceId || "").trim();

      if (!key || !deviceId || deviceId.length > 200) {
        return json({ error: "key and deviceId are required" }, 400);
      }

      const raw = await env.KEY_STORE.get(key);
      if (!raw) return json({ valid: false, error: "KEY_NOT_FOUND" }, 404);

      const record = JSON.parse(raw);

      if (Date.now() >= record.expiresAt) {
        return json({ valid: false, error: "KEY_EXPIRED" }, 403);
      }

      if (record.deviceId && record.deviceId !== deviceId) {
        return json({ valid: false, error: "DEVICE_MISMATCH" }, 403);
      }

      if (!record.deviceId) {
        record.deviceId = deviceId;
        await env.KEY_STORE.put(key, JSON.stringify(record));
      }

      return json({ valid: true, expiresAt: record.expiresAt });
    }

    return json({ error: "Not found" }, 404);
  }
};
```
