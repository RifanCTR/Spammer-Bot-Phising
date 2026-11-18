
const express = require("express");
const multer = require("multer");
const {
  Client,
  GatewayIntentBits,
  Events,
  PermissionFlagsBits
} = require("discord.js");

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm"
    ];

    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Format file tidak didukung."));
  }
});

let bot = null;
let botInfo = null;
let sending = false;
let cancelRequested = false;
let logs = [];

let progress = {
  total: 0,
  sent: 0,
  failed: 0,
  cancelled: 0,
  current: 0,
  state: "idle"
};

function addLog(status, messageNumber, message, detail = "") {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: new Date().toLocaleString("id-ID", {
      dateStyle: "short",
      timeStyle: "medium"
    }),
    status,
    messageNumber,
    message,
    detail
  };

  logs.unshift(entry);

  if (logs.length > 100) {
    logs.length = 100;
  }

  console.log(
    `[${status.toUpperCase()}] Pesan ${messageNumber}: ${message}` +
    (detail ? ` | ${detail}` : "")
  );
}

function requireBot(req, res, next) {
  if (!bot || !bot.isReady()) {
    return res.status(400).json({
      error: "Bot belum terhubung."
    });
  }

  next();
}

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

app.post("/api/connect", async (req, res) => {
  const token = String(req.body.token || "").trim();

  if (!token) {
    return res.status(400).json({
      error: "Token wajib diisi."
    });
  }

  if (sending) {
    return res.status(409).json({
      error: "Tunggu pengiriman selesai sebelum mengganti bot."
    });
  }

  let newBot;

  try {
    if (bot) {
      bot.destroy();
      bot = null;
      botInfo = null;
    }

    newBot = new Client({
      intents: [GatewayIntentBits.Guilds]
    });

    const readyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Waktu koneksi bot habis."));
      }, 15000);

      newBot.once(Events.ClientReady, () => {
        clearTimeout(timeout);
        resolve();
      });

      newBot.once(Events.Error, error => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    await newBot.login(token);
    await readyPromise;

    bot = newBot;

    botInfo = {
      username: bot.user.username,
      tag: bot.user.tag,
      id: bot.user.id
    };

    logs = [];

    progress = {
      total: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      current: 0,
      state: "idle"
    };

    res.json({
      success: true,
      bot: botInfo
    });

  } catch (error) {
    if (newBot) {
      newBot.destroy();
    }

    res.status(401).json({
      error: "Gagal menghubungkan bot. Periksa token dan koneksi internet."
    });
  }
});

app.get("/api/status", (req, res) => {
  res.json({
    connected: Boolean(bot && bot.isReady()),
    bot: botInfo,
    sending,
    progress
  });
});

app.get("/api/logs", (req, res) => {
  res.json({
    logs,
    progress
  });
});

app.delete("/api/logs", (req, res) => {
  if (sending) {
    return res.status(409).json({
      error: "Log tidak bisa dihapus saat pengiriman berjalan."
    });
  }

  logs = [];

  progress = {
    total: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    current: 0,
    state: "idle"
  };

  res.json({
    success: true
  });
});

app.get("/api/guilds", requireBot, (req, res) => {
  const guilds = [...bot.guilds.cache.values()].map(guild => ({
    id: guild.id,
    name: guild.name
  }));

  res.json({
    guilds
  });
});

app.get("/api/channels/:guildId", requireBot, async (req, res) => {
  try {
    const guild = await bot.guilds.fetch(req.params.guildId);
    const channels = await guild.channels.fetch();

    const result = channels
      .filter(channel =>
        channel &&
        channel.isTextBased() &&
        channel.isSendable()
      )
      .map(channel => ({
        id: channel.id,
        name: channel.name
      }));

    res.json({
      channels: result
    });

  } catch {
    res.status(403).json({
      error: "Bot tidak dapat mengakses server atau channel tersebut."
    });
  }
});

app.post(
  "/api/send",
  requireBot,
  upload.single("media"),
  async (req, res) => {

    if (sending) {
      return res.status(409).json({
        error: "Masih ada pengiriman yang berjalan."
      });
    }

    const guildId = String(req.body.guildId || "");
    const channelId = String(req.body.channelId || "");
    const message = String(req.body.message || "").trim();
    const mode = String(req.body.mode || "message");

    const count = Number(req.body.count);
    const interval = Number(req.body.interval);

    if (!guildId || !channelId || !message) {
      return res.status(400).json({
        error: "Server, channel, dan pesan wajib diisi."
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        error: "Pesan maksimal 2000 karakter."
      });
    }

    if (!Number.isInteger(count) || count < 1 || count > 1000000) {
      return res.status(400).json({
        error: "Jumlah pesan harus antara 1 sampai 1000000."
      });
    }

    if (
      !Number.isFinite(interval) ||
      interval < 0.1 ||
      interval > 60
    ) {
      return res.status(400).json({
        error: "Jeda harus antara 0.1 sampai 60 detik."
      });
    }

    if (!["message", "media"].includes(mode)) {
      return res.status(400).json({
        error: "Mode pengiriman tidak valid."
      });
    }

    if (mode === "media" && !req.file) {
      return res.status(400).json({
        error: "Pilih gambar atau video terlebih dahulu."
      });
    }

    try {
      const guild = await bot.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId);

      if (
        !channel ||
        !channel.isTextBased() ||
        !channel.isSendable()
      ) {
        return res.status(400).json({
          error: "Channel tidak valid atau tidak bisa menerima pesan."
        });
      }

      const permissions = channel.permissionsFor(bot.user);

      if (
        !permissions ||
        !permissions.has(PermissionFlagsBits.ViewChannel) ||
        !permissions.has(PermissionFlagsBits.SendMessages)
      ) {
        return res.status(403).json({
          error: "Bot tidak memiliki izin melihat dan mengirim pesan."
        });
      }

      if (
        mode === "media" &&
        !permissions.has(PermissionFlagsBits.AttachFiles)
      ) {
        return res.status(403).json({
          error: "Bot tidak memiliki izin mengirim lampiran."
        });
      }

      sending = true;
      cancelRequested = false;
      logs = [];

      progress = {
        total: count,
        sent: 0,
        failed: 0,
        cancelled: 0,
        current: 0,
        state: "sending"
      };

      addLog(
        "info",
        0,
        "Pengiriman dimulai",
        `Target: ${channel.name} | Total: ${count} pesan`
      );

      res.json({
        success: true,
        message: "Pengiriman dimulai."
      });

      for (let i = 1; i <= count; i++) {
        progress.current = i;

        if (cancelRequested) {
          const remaining = count - i + 1;

          progress.cancelled += remaining;

          addLog(
            "cancelled",
            i,
            `${remaining} pesan tidak dikirim`,
            "Pengiriman dibatalkan oleh pengguna."
          );

          break;
        }

        try {
          const payload = {
            content: message,
            allowedMentions: {
              parse: []
            }
          };

          if (mode === "media" && req.file) {
            payload.files = [{
              attachment: req.file.buffer,
              name: req.file.originalname
            }];
          }

          const sentMessage = await channel.send(payload);

          progress.sent++;

          addLog(
            "success",
            i,
            `Pesan ${i} berhasil dikirim`,
            `Message ID: ${sentMessage.id}`
          );

        } catch (error) {
          progress.failed++;

          addLog(
            "failed",
            i,
            `Pesan ${i} gagal dikirim`,
            error.message || "Kesalahan Discord API"
          );
        }

        if (i < count && !cancelRequested) {
          await sleep(interval * 1000);
        }
      }

      if (cancelRequested) {
        progress.state = "cancelled";
      } else if (progress.failed > 0) {
        progress.state = "completed_with_errors";
      } else {
        progress.state = "completed";
      }

      addLog(
        "info",
        0,
        "Pengiriman selesai",
        `Berhasil: ${progress.sent} | Gagal: ${progress.failed} | Dibatalkan: ${progress.cancelled}`
      );

    } catch (error) {
      addLog(
        "failed",
        0,
        "Pengiriman tidak dapat dimulai",
        error.message
      );

      if (!res.headersSent) {
        res.status(500).json({
          error: "Gagal memproses pengiriman."
        });
      }

    } finally {
      sending = false;
      cancelRequested = false;
    }
  }
);

app.post("/api/cancel", (req, res) => {
  if (!sending) {
    return res.json({
      success: false,
      message: "Tidak ada pengiriman yang berjalan."
    });
  }

  cancelRequested = true;

  res.json({
    success: true,
    message: "Permintaan pembatalan diterima."
  });
});

app.post("/api/disconnect", (req, res) => {
  if (sending) {
    return res.status(409).json({
      error: "Batalkan pengiriman dan tunggu sampai selesai."
    });
  }

  if (bot) {
    bot.destroy();
    bot = null;
    botInfo = null;
  }

  res.json({
    success: true
  });
});

app.use((err, req, res, next) => {
  console.error(err.message);

  if (res.headersSent) {
    return next(err);
  }

  res.status(400).json({
    error: err.message || "Terjadi kesalahan."
  });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log("--------------------------------");
  console.log("       IPAN SENDER AKTIF");
  console.log("--------------------------------");
  console.log(`Website: http://localhost:${PORT}`);
});
