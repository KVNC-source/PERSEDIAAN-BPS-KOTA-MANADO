-- File: backend/init_db_script.sql

-- Drop tables if they exist (useful for a clean re-initialization)
DROP TABLE IF EXISTS detail_pengeluaran;
DROP TABLE IF EXISTS pengeluaran;
DROP TABLE IF EXISTS stock;
DROP TABLE IF EXISTS barang_atk;
DROP TABLE IF EXISTS pegawai;

-- 1. Table for Employees
CREATE TABLE pegawai (
    id_pegawai INTEGER PRIMARY KEY,
    nama_pegawai TEXT NOT NULL UNIQUE
);

-- 2. Master List Table for ATK/ARK Items
CREATE TABLE barang_atk (
    id_barang INTEGER PRIMARY KEY,
    kode_barang TEXT,
    nama_barang_sakti TEXT,
    nama_barang TEXT NOT NULL,
    kategori TEXT,
    satuan TEXT NOT NULL
);

-- 3. Current Stock Table (links to barang_atk)
CREATE TABLE stock (
    id_barang INTEGER PRIMARY KEY,
    jumlah_tersedia INTEGER NOT NULL,
    FOREIGN KEY (id_barang) REFERENCES barang_atk(id_barang)
);

-- 4. Transaction Header Table
CREATE TABLE pengeluaran (
    id INTEGER PRIMARY KEY,
    no_bukti_full TEXT NOT NULL UNIQUE,
    tanggal_pengeluaran DATE NOT NULL,
    pegawai_id INTEGER NOT NULL,
    FOREIGN KEY (pegawai_id) REFERENCES pegawai(id_pegawai)
);

-- 5. Transaction Detail Table
CREATE TABLE detail_pengeluaran (
    id INTEGER PRIMARY KEY,
    pengeluaran_id INTEGER NOT NULL,
    barang_atk_id INTEGER NOT NULL,
    jumlah_keluar INTEGER NOT NULL,
    FOREIGN KEY (pengeluaran_id) REFERENCES pengeluaran(id),
    FOREIGN KEY (barang_atk_id) REFERENCES barang_atk(id_barang)
);