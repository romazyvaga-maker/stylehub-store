const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
const db = new Database(path.join(__dirname, "data", "store.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  category TEXT NOT NULL,
  brand TEXT DEFAULT '',
  description TEXT DEFAULT '',
  color TEXT DEFAULT '',
  sizes TEXT DEFAULT '',
  image TEXT DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  items_json TEXT NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Новый',
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);
const count = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
if (!count) {
  const sample = [
    ["Футболка Essential", 699, "Одежда", "NORTH", "Базовая футболка свободного кроя из мягкого хлопка.", "Чёрный", "S,M,L,XL", "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=85", 1],
    ["Худи Minimal", 1499, "Одежда", "FORM", "Удобное худи для повседневных образов.", "Серый", "S,M,L,XL", "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=85", 1],
    ["Кроссовки Urban", 2499, "Обувь", "PACE", "Минималистичные кроссовки на каждый день.", "Белый", "39,40,41,42,43,44", "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85", 1],
    ["Сумка Daily", 899, "Аксессуары", "FORM", "Компактная сумка для нужных мелочей.", "Чёрный", "ONE SIZE", "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=900&q=85", 0],
    ["Рубашка Oversize", 1199, "Одежда", "NORTH", "Свободная рубашка для многослойных образов.", "Белый", "S,M,L,XL", "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=85", 0],
    ["Кепка Basic", 499, "Аксессуары", "PACE", "Лаконичная кепка с регулируемой застёжкой.", "Чёрный", "ONE SIZE", "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=900&q=85", 0]
  ];
  const insert = db.prepare("INSERT INTO products (name,price,category,brand,description,color,sizes,image,featured) VALUES (?,?,?,?,?,?,?,?,?)");
  const tx = db.transaction(rows => rows.forEach(row => insert.run(...row)));
  tx(sample);
}
module.exports = db;
