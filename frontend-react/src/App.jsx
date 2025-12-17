import React, { useState, useEffect } from "react";

// NOTE: Ensure your project has an index.css or App.css imported in src/main.jsx
// containing the styling from your original style.css file.

// API Configuration
const API_URL = "http://127.0.0.1:5000/api";

function App() {
  // State variables to hold application data and UI state
  const [pegawaiList, setPegawaiList] = useState([]);
  const [barangList, setBarangList] = useState([]);
  const [pegawaiId, setPegawaiId] = useState("");
  // quantities stores the 'Ambil' quantity for each item (key: id_barang, value: qty)
  const [quantities, setQuantities] = useState({});
  const [message, setMessage] = useState({ content: "", type: "" });

  // ==================== UTILITIES ====================

  const displayMessage = (content, type) => {
    setMessage({ content, type });
  };

  // ==================== DATA FETCHING ====================

  const loadInitialData = async () => {
    try {
      const response = await fetch(`${API_URL}/data`);

      if (!response.ok) {
        // Handle network/server errors (e.g., if Flask isn't running)
        throw new Error(
          `Server returned status: ${response.status} (${response.statusText})`
        );
      }

      const data = await response.json();

      // Check for backend application errors (e.g., database failure message in the JSON payload)
      if (data.error) {
        displayMessage(`Error memuat data: ${data.error}`, "error");
        return;
      }

      // Update state with fetched data
      // Use (data.pegawai || []) and (data.barang || []) defensively
      setPegawaiList(data.pegawai || []);
      setBarangList(data.barang || []);

      // Initialize quantities state to 0 for all items
      // CRITICAL FIX: Ensure data.barang is an array before calling reduce
      // This prevents the "Cannot read properties of undefined (reading 'reduce')" crash
      const initialQuantities = (data.barang || []).reduce((acc, item) => {
        acc[item.id_barang] = 0;
        return acc;
      }, {});
      setQuantities(initialQuantities);

      // Clear any previous message
      setMessage({ content: "", type: "" });
    } catch (error) {
      displayMessage(
        `Gagal koneksi ke server backend. (Error: ${error.message}). Coba cek konsol backend Anda.`,
        "error"
      );
      console.error("Fetch Error:", error);
    }
  };

  // Run once after the component mounts to load data
  useEffect(() => {
    loadInitialData();
  }, []);

  // ==================== EVENT HANDLERS ====================

  const handlePegawaiChange = (e) => {
    setPegawaiId(e.target.value);
  };

  const handleQuantityChange = (id, value) => {
    // Only allow non-negative integers
    const qty = Math.max(0, parseInt(value) || 0);

    setQuantities((prevQuantities) => ({
      ...prevQuantities,
      [id]: qty,
    }));
  };

  const handleWithdraw = async () => {
    displayMessage("", ""); // Clear previous message

    if (!pegawaiId) {
      displayMessage("Mohon pilih Pegawai.", "error");
      return;
    }

    const items = [];
    let valid = true;

    // Validate quantities and build the withdrawal list
    // CRITICAL FIX: Ensure barangList is an array before looping over items
    for (const id in quantities) {
      const qty = quantities[id];
      // Find the barang object in the state based on its ID
      const barang = barangList.find((b) => b.id_barang == id);

      // Basic validation
      if (qty < 0 || isNaN(qty)) {
        displayMessage(
          `Input jumlah untuk ${barang?.nama_barang || "item"} tidak valid.`,
          "error"
        );
        valid = false;
        break;
      }

      // Stock check validation
      if (barang && qty > barang.jumlah_tersedia) {
        displayMessage(
          `Stok ${barang.nama_barang} hanya ${barang.jumlah_tersedia}. Jumlah ambil melebihi stok.`,
          "error"
        );
        valid = false;
        break;
      }

      if (qty > 0) {
        items.push({ id_barang: parseInt(id), jumlah_keluar: qty });
      }
    }

    if (!valid) return;
    if (items.length === 0) {
      displayMessage("Tidak ada barang yang dikeluarkan.", "error");
      return;
    }

    // API Call to process withdrawal
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
      setPegawaiId(""); // Clear selected employee
    } catch (error) {
      displayMessage(
        `Error komunikasi dengan API: ${error.message}. Cek koneksi server Flask.`,
        "error"
      );
      console.error("Withdrawal Error:", error);
    }
  };

  // ==================== JSX RENDERING ====================

  return (
    <div className="container">
      <h1>Form Pengeluaran Stok ATK/ARK</h1>

      {/* Pegawai Select Control */}
      <div className="controls">
        <label htmlFor="pegawai-select">Pegawai (Yang Mengambil):</label>
        <select
          id="pegawai-select"
          value={pegawaiId}
          onChange={handlePegawaiChange}
        >
          <option value="">-- Pilih Pegawai --</option>
          {/* CRITICAL FIX: Safely map over pegawaiList */}
          {(pegawaiList || []).map((pegawai) => (
            <option key={pegawai.id_pegawai} value={pegawai.id_pegawai}>
              {pegawai.nama_pegawai}
            </option>
          ))}
        </select>
      </div>

      <h2>Daftar Stok Tersedia</h2>

      {/* Stock List */}
      <div className="stock-list-container">
        <div className="stock-list-header">
          <span className="col-name">Nama Barang (Satuan)</span>
          <span className="col-stock">Stok</span>
          <span className="col-qty">Ambil</span>
        </div>

        <div id="stock-list">
          {/* CRITICAL FIX: Safely map over barangList */}
          {(barangList || []).map((barang) => {
            const stockClass =
              barang.jumlah_tersedia > 0 ? "positive" : "negative";
            return (
              <div key={barang.id_barang} className="stock-item">
                <span className="col-name">
                  {barang.nama_barang} ({barang.satuan})
                </span>
                <span className={`col-stock ${stockClass}`}>
                  {barang.jumlah_tersedia}
                </span>
                <span className="col-qty">
                  <input
                    type="number"
                    min="0"
                    value={quantities[barang.id_barang] || 0}
                    onChange={(e) =>
                      handleQuantityChange(barang.id_barang, e.target.value)
                    }
                  />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Withdraw Button */}
      <button
        id="withdraw-btn"
        onClick={handleWithdraw}
        // Disabled if no employee is selected OR if the lists haven't loaded yet
        disabled={!pegawaiId || barangList.length === 0}
      >
        Catat Pengeluaran & Cetak PDF
      </button>

      {/* Message Area */}
      {message.content && (
        <div className={`message ${message.type}`}>{message.content}</div>
      )}
    </div>
  );
}

export default App;
