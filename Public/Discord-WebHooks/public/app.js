"use strict";

const webhook = document.getElementById("webhook");
const message = document.getElementById("message");
const countInput = document.getElementById("count");
const intervalInput = document.getElementById("interval");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const clearBtn = document.getElementById("clearBtn");

const logs = document.getElementById("logs");
const statusBadge = document.getElementById("status");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const progressPercent = document.getElementById("progressPercent");

const statTotal = document.getElementById("statTotal");
const statSuccess = document.getElementById("statSuccess");
const statFailed = document.getElementById("statFailed");

let running = false;
let stopRequested = false;

function addLog(text, type = "info") {
  const empty = logs.querySelector(".empty-log");
  if (empty) empty.remove();

  const item = document.createElement("div");
  item.className = `log ${type}`;
  item.textContent = `${new Date().toLocaleTimeString()} — ${text}`;

  logs.prepend(item);
}

function updateStats(total, success, failed) {
  statTotal.textContent = total;
  statSuccess.textContent = success;
  statFailed.textContent = failed;
}

function updateProgress(done, total) {
  if (total === 0) {
    progressText.textContent = "Belum ada pengiriman";
    progressPercent.textContent = "0%";
    progressBar.style.width = "0%";
    return;
  }

  const percent = Math.round((done / total) * 100);
  progressText.textContent = `${done} / ${total}`;
  progressPercent.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;
}

function setRunning(value) {
  running = value;
  startBtn.disabled = value;
  stopBtn.disabled = !value;
  statusBadge.textContent = value ? "Running" : "Ready";
  statusBadge.dataset.state = value ? "sending" : "idle";
}

function wait(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

startBtn.addEventListener("click", async () => {
  if (running) return;

  const url = webhook.value.trim();
  const text = message.value.trim();
  const count = Number(countInput.value);
  const interval = parseFloat(intervalInput.value);

  if (!url || !text) {
    addLog("Webhook URL dan pesan wajib diisi.", "error");
    return;
  }

  if (!Number.isInteger(count) || count < 1 || count > 1000000) {
    addLog("Jumlah pesan harus antara 1 sampai 1.000.000.", "error");
    return;
  }

  if (!Number.isFinite(interval) || interval < 0.1 || interval > 60) {
    addLog("Delay harus antara 0.1 sampai 60 detik.", "error");
    return;
  }

  stopRequested = false;
  setRunning(true);

  let done = 0;
  let successCount = 0;
  let failedCount = 0;

  updateStats(count, 0, 0);
  updateProgress(0, count);
  addLog("Pengujian dimulai.");

  try {
    for (let i = 0; i < count; i++) {
      if (stopRequested) break;

      const response = await fetch("/api/webhook-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          webhookUrl: url,
          message: text
        })
      });

      let result = {};
      try {
        result = await response.json();
      } catch (_) {
        result = {};
      }

      done++;

      if (!response.ok) {
        failedCount++;
        updateStats(count, successCount, failedCount);
        updateProgress(done, count);
        addLog(`Pesan ${i + 1} gagal: ${result.error || `HTTP ${response.status}`}`, "error");
        break;
      }

      successCount++;
      updateStats(count, successCount, failedCount);
      updateProgress(done, count);
      addLog(`Pesan ${i + 1} berhasil dikirim.`, "success");

      if (i < count - 1 && !stopRequested) {
        addLog(`Menunggu ${interval} detik sebelum pengiriman berikutnya.`);
        await wait(interval);
      }
    }

    if (stopRequested) {
      addLog("Pengujian dihentikan.", "info");
    } else if (successCount === count) {
      addLog("Pengujian selesai.", "success");
    }
  } catch (error) {
    failedCount++;
    updateStats(count, successCount, failedCount);
    addLog("Terjadi kesalahan koneksi ke server.", "error");
  } finally {
    setRunning(false);
  }
});

stopBtn.addEventListener("click", () => {
  stopRequested = true;
  addLog("Permintaan berhenti diterima.", "info");
});

clearBtn.addEventListener("click", () => {
  logs.innerHTML = '<div class="empty-log">Belum ada aktivitas.</div>';
  updateStats(0, 0, 0);
  updateProgress(0, 0);
});