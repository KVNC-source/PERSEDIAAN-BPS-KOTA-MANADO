// File: frontend/script.js

const API_URL = "http://127.0.0.1:5000/api";
let barangData = [];

// --- UTILITIES ---

function displayMessage(message, type) {
  const msgDiv = document.getElementById("message");
  msgDiv.textContent = message;
  msgDiv.className = `message ${type}`;
}

// --- DATA POPULATION ---

function populatePegawai(pegawaiList) {
  const select = document.getElementById("pegawai-select");
  select.innerHTML = '<option value="">-- Pilih Pegawai --</option>';
  pegawaiList.forEach((pegawai) => {
    const option = document.createElement("option");
    option.value = pegawai.id_pegawai;
    option.textContent = pegawai.nama_pegawai;
    select.appendChild(option);
  });
}

function populateBarang(barangList) {
  const listDiv = document.getElementById("stock-list");
  listDiv.innerHTML = "";
  barangData = barangList;

  barangList.forEach((barang) => {
    const stockClass = barang.jumlah_tersedia > 0 ? "positive" : "negative";

    const itemDiv = document.createElement("div");
    itemDiv.className = "stock-item";
    itemDiv.innerHTML = `
            <span class="col-name">${barang.nama_barang} (${barang.satuan})</span>
            <span class="col-stock ${stockClass}">${barang.jumlah_tersedia}</span>
            <span class="col-qty">
                <input type="number" data-id="${barang.id_barang}" data-stock="${barang.jumlah_tersedia}" min="0" value="0">
            </span>
        `;
    listDiv.appendChild(itemDiv);
  });
}

async function loadInitialData() {
  try {
    const response = await fetch(`${API_URL}/data`);

    if (!response.ok) {
      throw new Error("Failed to fetch data from API");
    }

    const data = await response.json();

    if (data.error) {
      displayMessage(`Error memuat data: ${data.error}`, "error");
      return;
    }

    populatePegawai(data.pegawai);
    populateBarang(data.barang);
  } catch (error) {
    displayMessage(
      `Gagal koneksi ke server backend. (Error: ${error.message}). Coba restart aplikasi.`,
      "error"
    );
    console.error("Fetch Error:", error);
  }
}

// --- TRANSACTION LOGIC ---

async function handleWithdraw() {
  displayMessage("", "");

  const pegawaiSelect = document.getElementById("pegawai-select");
  const pegawaiId = pegawaiSelect.value;

  if (!pegawaiId) {
    displayMessage("Mohon pilih Pegawai.", "error");
    return;
  }

  const items = [];
  let totalItems = 0;
  let valid = true;

  document
    .querySelectorAll('#stock-list input[type="number"]')
    .forEach((input) => {
      const qty = parseInt(input.value);
      const itemId = parseInt(input.dataset.id);
      const itemName = barangData.find(
        (b) => b.id_barang == itemId
      ).nama_barang;

      if (qty < 0 || isNaN(qty)) {
        displayMessage(`Input jumlah untuk ${itemName} tidak valid.`, "error");
        valid = false;
        return;
      }

      if (qty > 0) {
        items.push({ id_barang: itemId, jumlah_keluar: qty });
        totalItems++;
      }
    });

  if (!valid) return;
  if (totalItems === 0) {
    displayMessage("Tidak ada barang yang dikeluarkan.", "error");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pegawai_id: parseInt(pegawaiId), items: items }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      displayMessage(
        `Transaksi Gagal: ${responseData.error || response.statusText}`,
        "error"
      );
      return;
    }

    // Transaksi Sukses
    const noBukti = responseData.no_bukti;
    const pdfFile = responseData.pdf_file;

    displayMessage(
      `✅ Pengeluaran dicatat (No. Bukti ${noBukti}). PDF disimpan di folder Pengeluaran_PDF/${pdfFile}`,
      "success"
    );

    // Bersihkan input dan refresh data
    loadInitialData();
  } catch (error) {
    displayMessage(
      `Error komunikasi dengan API: ${error.message}. Cek koneksi server Flask.`,
      "error"
    );
    console.error("Withdrawal Error:", error);
  }
}

// --- INICIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  loadInitialData();
  document
    .getElementById("withdraw-btn")
    .addEventListener("click", handleWithdraw);
});
