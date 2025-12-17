# File: backend/api.py

import sqlite3
import pandas as pd
from datetime import datetime
import os
import sys
from flask import Flask, request, jsonify, send_file
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Table, TableStyle
from reportlab.lib import colors

# --- KONFIGURASI DAN INIT ---
app = Flask(__name__)

# Tentukan path DB dan Data
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_NAME = 'stock_db.sqlite'
DB_PATH = os.path.join(BASE_DIR, DATABASE_NAME)
PDF_OUTPUT_DIR = os.path.join(BASE_DIR, '..', 'Pengeluaran_PDF')

# *** PATH DIKOREKSI UNTUK FOLDER DB/ ***
DATA_DIR = os.path.join(BASE_DIR, 'DB')

CSV_FILES = {
    'barang_atk': os.path.join(DATA_DIR, 'Book1.xlsx - Sheet1.csv'),
    'pegawai': os.path.join(DATA_DIR, 'Book2.xlsx - Sheet1.csv'),
    'stock': os.path.join(DATA_DIR, 'Book3.xlsx - Sheet1.csv')
}

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db_and_load_data():
    """Membuat skema dan mengisi data dari CSV jika database kosong."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Buat Skema
    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS pegawai (id_pegawai INTEGER PRIMARY KEY, nama_pegawai TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS barang_atk (id_barang INTEGER PRIMARY KEY, kode_barang TEXT, nama_barang_sakti TEXT, nama_barang TEXT NOT NULL, kategori TEXT, satuan TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS stock (id_barang INTEGER PRIMARY KEY, jumlah_tersedia INTEGER NOT NULL, FOREIGN KEY (id_barang) REFERENCES barang_atk(id_barang));
        CREATE TABLE IF NOT EXISTS pengeluaran (id INTEGER PRIMARY KEY, no_bukti_full TEXT NOT NULL UNIQUE, tanggal_pengeluaran DATE NOT NULL, pegawai_id INTEGER NOT NULL, FOREIGN KEY (pegawai_id) REFERENCES pegawai(id_pegawai));
        CREATE TABLE IF NOT EXISTS detail_pengeluaran (id INTEGER PRIMARY KEY, pengeluaran_id INTEGER NOT NULL, barang_atk_id INTEGER NOT NULL, jumlah_keluar INTEGER NOT NULL, FOREIGN KEY (pengeluaran_id) REFERENCES pengeluaran(id), FOREIGN KEY (barang_atk_id) REFERENCES barang_atk(id_barang));
    """)
    conn.commit()

    # 2. Cek apakah sudah terisi data
    count = cursor.execute("SELECT COUNT(*) FROM pegawai").fetchone()[0]
    if count > 0:
        conn.close()
        return

    print("--- Memuat data dari file CSV (Langkah Inisialisasi) ---")
    try:
        # --- Load Pegawai (Book2) ---
        df_pegawai = pd.read_csv(CSV_FILES['pegawai'])
        
        # Koreksi: Menggunakan baris pertama sebagai data, bukan header
        # Baris pertama adalah header "All", kita ganti nama kolom & buang baris "All"
        df_pegawai.columns = ['nama_pegawai'] 
        df_pegawai = df_pegawai.iloc[1:].copy() 
        
        df_pegawai['id_pegawai'] = df_pegawai.reset_index(drop=True).index + 1
        pegawai_data = df_pegawai[['id_pegawai', 'nama_pegawai']].to_dict('records')
        conn.executemany("INSERT INTO pegawai (id_pegawai, nama_pegawai) VALUES (?, ?)", 
                           [(r['id_pegawai'], r['nama_pegawai']) for r in pegawai_data])

        # --- Load Barang ATK (Master List - Book1) ---
        df_barang_atk = pd.read_csv(CSV_FILES['barang_atk'])
        df_barang_atk.rename(columns={
            'Kode Barang': 'kode_barang', 'Nama Barang di SAKTI': 'nama_barang_sakti', 
            'Nama Barang': 'nama_barang', 'Kategori': 'kategori', 'Satuan': 'satuan'
        }, inplace=True)
        df_barang_atk['id_barang'] = df_barang_atk.reset_index(drop=True).index + 1
        df_barang_atk.fillna('', inplace=True)

        barang_data_tuples = [(r['id_barang'], r['kode_barang'], r['nama_barang_sakti'], r['nama_barang'], r['kategori'], r['satuan']) for r in df_barang_atk.to_dict('records')]
        conn.executemany("""
            INSERT INTO barang_atk (id_barang, kode_barang, nama_barang_sakti, nama_barang, kategori, satuan) 
            VALUES (?, ?, ?, ?, ?, ?)
        """, barang_data_tuples)

        # --- Load Stock (Current Qty - Book3) ---
        df_stock_data = pd.read_csv(CSV_FILES['stock'])
        df_stock_data.rename(columns={'Nama Barang': 'nama_barang', 'Tersedia': 'jumlah_tersedia'}, inplace=True)
        df_stock_data['jumlah_tersedia'] = pd.to_numeric(df_stock_data['jumlah_tersedia'], errors='coerce').fillna(0).astype(int)
        
        # Merge by nama_barang to link IDs
        df_stock_merged = pd.merge(
            df_barang_atk[['id_barang', 'nama_barang']],
            df_stock_data[['nama_barang', 'jumlah_tersedia']],
            on='nama_barang',
            how='inner'
        ).drop_duplicates(subset=['id_barang'])

        stock_data_tuples = [(r['id_barang'], r['jumlah_tersedia']) for r in df_stock_merged.to_dict('records')]
        conn.executemany("INSERT INTO stock (id_barang, jumlah_tersedia) VALUES (?, ?)", 
                           stock_data_tuples)

        conn.commit()
        print("Data berhasil dimuat dan database siap.")

    except FileNotFoundError as e:
        print(f"Error File: File CSV tidak ditemukan: {e}. Pastikan file ada di folder 'DB'.", file=sys.stderr)
        conn.rollback()
    except Exception as e:
        print(f"Error saat memuat data: {e}", file=sys.stderr)
        conn.rollback()
    finally:
        conn.close()

init_db_and_load_data()


# --- LOGIKA APLIKASI (Sama seperti sebelumnya, handling PDF diubah sedikit) ---

def generate_no_bukti():
    conn = get_db_connection()
    last_id = conn.execute("SELECT MAX(id) FROM pengeluaran").fetchone()[0]
    next_sequence = (last_id or 0) + 1
    conn.close()
    return f"{next_sequence:02d}"

def create_pdf_form(no_bukti, tanggal, nama_pegawai, items_withdrawn):
    """Membuat formulir PDF pengeluaran dan menyimpannya di Pengeluaran_PDF/."""
    os.makedirs(PDF_OUTPUT_DIR, exist_ok=True)
    pdf_filename = f'FORM_PENGAMBILAN_{no_bukti}_{tanggal}.pdf'
    save_path = os.path.join(PDF_OUTPUT_DIR, pdf_filename)

    # --- REPORTLAB CODE ---
    c = canvas.Canvas(save_path, pagesize=A4)
    width, height = A4
    
    c.setFont('Helvetica-Bold', 14)
    c.drawCentredString(width / 2, height - 50, "FORM PENGAMBILAN BARANG ATK/ARK PERSEDIAAN")
    
    c.setFont('Helvetica', 10)
    c.drawString(50, height - 80, f"No. Bukti: {no_bukti}")
    c.drawString(50, height - 95, f"Tanggal: {tanggal}")
    c.drawString(50, height - 110, f"Pegawai: {nama_pegawai}")
    
    table_data = [['No.', 'Nama Barang', 'Satuan', 'Jumlah']]
    for i, item in enumerate(items_withdrawn, 1):
        table_data.append([str(i), item['nama_barang'], item['satuan'], str(item['jumlah_keluar'])])

    table = Table(table_data, colWidths=[0.5*72, 3.5*72, 1.5*72, 1.5*72])
    
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    
    table_height = table.wrapOn(c, width, height)[1]
    table.drawOn(c, 50, height - 150 - table_height)

    footer_y = height - 150 - table_height - 50
    c.setFont('Helvetica', 10)
    c.drawString(50, footer_y, "Yang Mengambil,")
    c.drawString(width - 150, footer_y, "Yang Menyerahkan,")
    c.drawString(50, footer_y - 70, f"({nama_pegawai})")
    c.drawString(width - 150, footer_y - 70, "(.........................)")

    c.showPage()
    c.save()
    
    return pdf_filename


# --- API ROUTES ---

@app.route('/api/data', methods=['GET'])
def get_initial_data():
    conn = get_db_connection()
    try:
        pegawai_list = conn.execute("SELECT id_pegawai, nama_pegawai FROM pegawai ORDER BY nama_pegawai").fetchall()
        barang_list = conn.execute("""
            SELECT b.id_barang, b.nama_barang, b.satuan, s.jumlah_tersedia
            FROM barang_atk b JOIN stock s ON b.id_barang = s.id_barang
            ORDER BY b.nama_barang
        """).fetchall()

        return jsonify({
            'pegawai': [dict(row) for row in pegawai_list],
            'barang': [dict(row) for row in barang_list]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/withdraw', methods=['POST'])
def process_withdraw():
    data = request.json
    pegawai_id = data.get('pegawai_id')
    items_to_withdraw = data.get('items')
    
    if not pegawai_id or not items_to_withdraw:
        return jsonify({'error': 'Input tidak lengkap.'}), 400

    conn = get_db_connection()
    conn.execute("BEGIN TRANSACTION")
    tanggal = datetime.now().strftime("%Y-%m-%d")
    
    try:
        no_bukti_full = generate_no_bukti()

        conn.execute(
            "INSERT INTO pengeluaran (no_bukti_full, tanggal_pengeluaran, pegawai_id) VALUES (?, ?, ?)",
            (no_bukti_full, tanggal, pegawai_id)
        )
        pengeluaran_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        items_for_pdf = []
        nama_pegawai_row = conn.execute("SELECT nama_pegawai FROM pegawai WHERE id_pegawai = ?", (pegawai_id,)).fetchone()
        nama_pegawai = nama_pegawai_row['nama_pegawai'] if nama_pegawai_row else 'N/A'

        for item in items_to_withdraw:
            barang_atk_id = item['id_barang']
            jumlah_keluar = item['jumlah_keluar']
            
            current_stock_row = conn.execute("""
                SELECT b.nama_barang, b.satuan, s.jumlah_tersedia 
                FROM barang_atk b JOIN stock s ON b.id_barang = s.id_barang 
                WHERE b.id_barang = ?
            """, (barang_atk_id,)).fetchone()
            
            if current_stock_row['jumlah_tersedia'] < jumlah_keluar:
                print(f"PERINGATAN: Stok negatif untuk {current_stock_row['nama_barang']}")

            conn.execute(
                "INSERT INTO detail_pengeluaran (pengeluaran_id, barang_atk_id, jumlah_keluar) VALUES (?, ?, ?)",
                (pengeluaran_id, barang_atk_id, jumlah_keluar)
            )
            
            conn.execute(
                "UPDATE stock SET jumlah_tersedia = jumlah_tersedia - ? WHERE id_barang = ?",
                (jumlah_keluar, barang_atk_id)
            )

            items_for_pdf.append({
                'nama_barang': current_stock_row['nama_barang'],
                'satuan': current_stock_row['satuan'],
                'jumlah_keluar': jumlah_keluar
            })
        
        conn.commit()
        
        pdf_filename = create_pdf_form(no_bukti_full, tanggal, nama_pegawai, items_for_pdf)
        
        return jsonify({'message': 'Transaksi sukses', 'no_bukti': no_bukti_full, 'pdf_file': pdf_filename})

    except Exception as e:
        conn.execute("ROLLBACK")
        return jsonify({'error': f"Gagal memproses transaksi: {e}"}), 500
    finally:
        conn.close()

if __name__ == '__main__':
    app.run(port=5000)