
"use strict";

const express = require("express");

const app = express();
const PORT = 3001;

app.use(express.json({ limit: "10kb" }));
app.use(express.static("public"));

app.post("/api/webhook-test", async (req, res) => {
  try {
    const { webhookUrl, message } = req.body;

    if (typeof webhookUrl !== "string" ||
        typeof message !== "string" ||
        !message.trim()) {
      return res.status(400).json({
        error: "Data tidak valid."
      });
    }

    const parsed = new URL(webhookUrl);

    if (
      parsed.protocol !== "https:" ||
      !["discord.com", "discordapp.com"].includes(parsed.hostname) ||
      !/^\/api\/webhooks\/\d+\/[^/]+\/?$/.test(parsed.pathname)
    ) {
      return res.status(400).json({
        error: "Format Discord Webhook URL tidak valid."
      });
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: message.trim().slice(0, 2000)
      })
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Discord mengembalikan status ${response.status}.`
      });
    }

    return res.json({ success: true });

  } catch (error) {
    return res.status(400).json({
      error: "URL atau permintaan tidak valid."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Discord Hooks berjalan di http://localhost:${PORT}`);
});
