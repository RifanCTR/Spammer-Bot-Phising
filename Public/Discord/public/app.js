
const $ = id => document.getElementById(id);

const tokenInput = $("token");
const connectBtn = $("connectBtn");
const disconnectBtn = $("disconnectBtn");
const guildSelect = $("guildSelect");
const channelSelect = $("channelSelect");
const sendBtn = $("sendBtn");
const cancelBtn = $("cancelBtn");
const result = $("result");

let connected = false;
let sending = false;
let lastLogSignature = "";

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Terjadi kesalahan.");
  }

  return data;
}

function showResult(message, type = "") {
  result.textContent = message;
  result.className = `result ${type}`;
  result.classList.remove("hidden");
}

function setConnection(value, bot = null) {
  connected = value;

  $("statusDot").classList.toggle("online", value);

  $("statusText").textContent = value
    ? "Bot terhubung"
    : "Belum terhubung";

  connectBtn.disabled = value || sending;
  disconnectBtn.disabled = !value || sending;
  guildSelect.disabled = !value;
  sendBtn.disabled = !value || sending;

  if (bot) {
    $("botInfo").textContent = `Terhubung sebagai ${bot.tag}`;
    $("botInfo").classList.remove("hidden");
  } else {
    $("botInfo").classList.add("hidden");
  }
}

function setSending(value) {
  sending = value;

  sendBtn.disabled = !connected || value;
  connectBtn.disabled = connected || value;
  disconnectBtn.disabled = !connected || value;

  cancelBtn.classList.toggle("hidden", !value);
  cancelBtn.disabled = !value;

  $("clearLogsBtn").disabled = value;
}

$("toggleToken").addEventListener("click", () => {
  const visible = tokenInput.type === "password";

  tokenInput.type = visible ? "text" : "password";

  $("toggleToken").textContent = visible
    ? "Sembunyikan"
    : "Lihat";
});

connectBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();

  if (!token) {
    showResult("Masukkan Bot Token terlebih dahulu.", "error");
    return;
  }

  connectBtn.disabled = true;

  showResult("Sedang menghubungkan bot...");

  try {
    const data = await api("/api/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ token })
    });

    tokenInput.value = "";

    setConnection(true, data.bot);

    await loadGuilds();
    await refreshLogs();

    showResult("Bot berhasil terhubung.", "success");

  } catch (error) {
    setConnection(false);

    connectBtn.disabled = false;

    showResult(error.message, "error");
  }
});

disconnectBtn.addEventListener("click", async () => {
  try {
    await api("/api/disconnect", {
      method: "POST"
    });

    guildSelect.innerHTML =
      "<option value=''>Hubungkan bot dahulu</option>";

    channelSelect.innerHTML =
      "<option value=''>Pilih server dahulu</option>";

    channelSelect.disabled = true;

    setConnection(false);

    showResult("Bot berhasil diputuskan.", "success");

  } catch (error) {
    showResult(error.message, "error");
  }
});

async function loadGuilds() {
  const data = await api("/api/guilds");

  guildSelect.innerHTML =
    "<option value=''>Pilih server</option>";

  data.guilds.forEach(guild => {
    const option = document.createElement("option");

    option.value = guild.id;
    option.textContent = guild.name;

    guildSelect.appendChild(option);
  });

  if (!data.guilds.length) {
    guildSelect.innerHTML =
      "<option value=''>Bot belum bergabung ke server</option>";
  }
}

guildSelect.addEventListener("change", async () => {
  const guildId = guildSelect.value;

  channelSelect.innerHTML =
    "<option value=''>Memuat channel...</option>";

  channelSelect.disabled = true;

  if (!guildId) {
    channelSelect.innerHTML =
      "<option value=''>Pilih server dahulu</option>";

    return;
  }

  try {
    const data = await api(
      `/api/channels/${encodeURIComponent(guildId)}`
    );

    channelSelect.innerHTML =
      "<option value=''>Pilih channel</option>";

    data.channels.forEach(channel => {
      const option = document.createElement("option");

      option.value = channel.id;
      option.textContent = `# ${channel.name}`;

      channelSelect.appendChild(option);
    });

    channelSelect.disabled = false;

    if (!data.channels.length) {
      channelSelect.innerHTML =
        "<option value=''>Tidak ada channel yang bisa digunakan</option>";
    }

  } catch (error) {
    channelSelect.innerHTML =
      "<option value=''>Gagal memuat channel</option>";

    showResult(error.message, "error");
  }
});

document.querySelectorAll("input[name='mode']").forEach(radio => {
  radio.addEventListener("change", () => {
    const selectedMode =
      document.querySelector("input[name='mode']:checked").value;

    const mediaMode = selectedMode === "media";

    $("mediaArea").classList.toggle("hidden", !mediaMode);
  });
});

$("message").addEventListener("input", () => {
  $("charCount").textContent = $("message").value.length;
});

$("media").addEventListener("change", () => {
  const file = $("media").files[0];

  $("fileInfo").textContent = file
    ? `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
    : "";
});

function logAppearance(status) {
  const appearances = {
    success: {
      symbol: "✓",
      label: "Berhasil"
    },

    failed: {
      symbol: "!",
      label: "Gagal"
    },

    cancelled: {
      symbol: "–",
      label: "Dibatalkan"
    },

    info: {
      symbol: "i",
      label: "Info"
    }
  };

  return appearances[status] || appearances.info;
}

function createLogItem(log) {
  const appearance = logAppearance(log.status);

  const item = document.createElement("div");
  item.className = `log-item ${log.status}`;

  const symbol = document.createElement("div");
  symbol.className = "log-symbol";
  symbol.textContent = appearance.symbol;

  const content = document.createElement("div");
  content.className = "log-content";

  const topline = document.createElement("div");
  topline.className = "log-topline";

  const title = document.createElement("div");
  title.className = "log-title";
  title.textContent = log.message;

  const time = document.createElement("div");
  time.className = "log-time";
  time.textContent = log.time;

  const detail = document.createElement("div");
  detail.className = "log-detail";

  detail.textContent = log.detail
    ? `${appearance.label} · ${log.detail}`
    : appearance.label;

  topline.append(title, time);
  content.append(topline, detail);
  item.append(symbol, content);

  return item;
}

function renderLogs(data) {
  const logList = $("logList");

  const logs = data.logs || [];
  const progress = data.progress || {};

  $("totalStat").textContent =
    Number(progress.total || 0);

  $("successStat").textContent =
    Number(progress.sent || 0);

  $("failedStat").textContent =
    Number(progress.failed || 0);

  const cancelledStat = $("cancelledStat");

  if (cancelledStat) {
    cancelledStat.textContent =
      Number(progress.cancelled || 0);
  }

  const total = Number(progress.total || 0);

  const processed =
    Number(progress.sent || 0) +
    Number(progress.failed || 0) +
    Number(progress.cancelled || 0);

  const percent = total
    ? Math.min(100, Math.round((processed / total) * 100))
    : 0;

  $("progressBar").style.width = `${percent}%`;
  $("progressPercent").textContent = `${percent}%`;

  if (progress.state === "sending") {
    $("progressText").textContent =
      `Sedang memproses ${processed}/${total} pesan`;

  } else if (total > 0) {
    $("progressText").textContent =
      `Selesai memproses ${processed}/${total} pesan`;

  } else {
    $("progressText").textContent =
      "Belum ada pengiriman";
  }

  const signature = logs.map(log => log.id).join("|");

  if (signature !== lastLogSignature) {
    lastLogSignature = signature;

    logList.replaceChildren();

    if (!logs.length) {
      const empty = document.createElement("div");

      empty.className = "empty-log";
      empty.textContent =
        "Belum ada aktivitas pengiriman.";

      logList.appendChild(empty);

    } else {
      logs.forEach(log => {
        logList.appendChild(createLogItem(log));
      });
    }
  }

  $("clearLogsBtn").disabled = sending;
}

async function refreshLogs() {
  try {
    const data = await api("/api/logs");

    renderLogs(data);

  } catch (error) {
    console.error("Gagal mengambil log:", error.message);
  }
}

sendBtn.addEventListener("click", async () => {
  if (!connected || sending) return;

  const guildId = guildSelect.value;
  const channelId = channelSelect.value;

  const message = $("message").value.trim();

  const mode =
    document.querySelector("input[name='mode']:checked").value;

  const count = Number($("count").value);

  const interval = parseFloat($("interval").value);

  const file = $("media").files[0];

  if (!guildId || !channelId) {
    showResult(
      "Pilih server dan channel terlebih dahulu.",
      "error"
    );

    return;
  }

  if (!message) {
    showResult("Isi pesan belum diisi.", "error");
    return;
  }

  if (!Number.isInteger(count) || count < 1 || count > 1000000) {
    showResult(
      "Jumlah pesan.",
      "error"
    );

    return;
  }

  if (
    !Number.isFinite(interval) ||
    interval < 0.1 ||
    interval > 60
  ) {
    showResult(
      "Jeda harus antara 0.1 sampai 60 detik.",
      "error"
    );

    return;
  }

  if (mode === "media" && !file) {
    showResult(
      "Pilih gambar atau video terlebih dahulu.",
      "error"
    );

    return;
  }

  const formData = new FormData();

  formData.append("guildId", guildId);
  formData.append("channelId", channelId);
  formData.append("message", message);
  formData.append("mode", mode);
  formData.append("count", count);
  formData.append("interval", interval);

  if (mode === "media") {
    formData.append("media", file);
  }

  setSending(true);

  showResult(`Memulai pengiriman ${count} pesan...`);

  try {
    await api("/api/send", {
      method: "POST",
      body: formData
    });

    showResult(
      "Pengiriman dimulai. Pantau hasilnya di Activity Log."
    );

    await monitorSending();

  } catch (error) {
    showResult(error.message, "error");

    await refreshLogs();

  } finally {
    setSending(false);

    await refreshLogs();
  }
});

async function monitorSending() {
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const [statusData, logData] = await Promise.all([
        api("/api/status"),
        api("/api/logs")
      ]);

      renderLogs(logData);

      if (!statusData.sending) {
        const p = statusData.progress || {};

        showResult(
          `Pengiriman selesai.\nBerhasil: ${p.sent || 0}\nGagal: ${p.failed || 0}\nDibatalkan: ${p.cancelled || 0}`,
          p.failed > 0 ? "error" : "success"
        );

        break;
      }

    } catch (error) {
      console.error("Gagal memantau pengiriman:", error.message);

      showResult(
        "Koneksi pemantauan terganggu. Mencoba kembali..."
      );
    }
  }
}

cancelBtn.addEventListener("click", async () => {
  try {
    await api("/api/cancel", {
      method: "POST"
    });

    cancelBtn.disabled = true;

    showResult(
      "Permintaan pembatalan diterima. Tunggu proses yang sedang berjalan berhenti."
    );

  } catch (error) {
    showResult(error.message, "error");
  }
});

$("clearLogsBtn").addEventListener("click", async () => {
  if (sending) return;

  try {
    await api("/api/logs", {
      method: "DELETE"
    });

    lastLogSignature = "";

    await refreshLogs();

    showResult(
      "Riwayat log berhasil dihapus.",
      "success"
    );

  } catch (error) {
    showResult(error.message, "error");
  }
});

(async function init() {
  try {
    const data = await api("/api/status");

    if (data.connected) {
      setConnection(true, data.bot);

      await loadGuilds();

      if (data.sending) {
        setSending(true);
        await monitorSending();
        setSending(false);
      }

    } else {
      setConnection(false);
    }

    await refreshLogs();

  } catch {
    setConnection(false);
  }
})();
