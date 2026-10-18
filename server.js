require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const db = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
for (const dir of ["data", "uploads"]) {
  fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
}
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: path.join(ROOT, "data") }),
  secret: process.env.SESSION_SECRET || "local-development-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use("/uploads", express.static(path.join(ROOT, "uploads")));
app.use(express.static(path.join(ROOT, "public")));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(ROOT, "uploads")),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    cb(allowed.includes(file.mimetype) ? null : new Error("Разрешены только JPG, PNG, WEBP или GIF."), allowed.includes(file.mimetype));
  }
});

function userSafe(user) {
  return user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null;
}
function currentUser(req) {
  if (!req.session.userId) return null;
  return db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(req.session.userId) || null;
}
function requireAuth(req, res, next) {
  if (!currentUser(req)) return res.status(401).json({ error: "Сначала войдите в аккаунт." });
  next();
}
function requireAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Доступ только для администратора." });
  next();
}
function cleanText(value, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}
function parseProduct(body, existing = null) {
  const name = cleanText(body.name, 160);
  const price = Number(body.price);
  const category = cleanText(body.category, 40);
  const brand = cleanText(body.brand, 80);
  const description = cleanText(body.description, 4000);
  const color = cleanText(body.color, 50);
  const sizes = cleanText(body.sizes, 120);
  const image = cleanText(body.image, 500) || existing?.image || "";
  if (!name || !Number.isFinite(price) || price < 0 || !category) throw new Error("Укажи название, категорию и корректную цену.");
  return { name, price, category, brand, description, color, sizes, image, featured: body.featured === "1" || body.featured === "true" || body.featured === true ? 1 : 0 };
}

app.get("/api/me", (req, res) => res.json({ user: userSafe(currentUser(req)) }));

app.post("/api/register", async (req, res) => {
  try {
    const name = cleanText(req.body.name, 80);
    const email = cleanText(req.body.email, 160).toLowerCase();
    const password = String(req.body.password || "");
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      return res.status(400).json({ error: "Введи имя, корректный email и пароль минимум из 8 символов." });
    }
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) return res.status(409).json({ error: "Этот email уже зарегистрирован." });
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'customer')").run(name, email, hash);
    req.session.userId = result.lastInsertRowid;
    res.json({ user: userSafe(currentUser(req)) });
  } catch (e) { res.status(500).json({ error: "Не удалось создать аккаунт." }); }
});

app.post("/api/login", async (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Неверный email или пароль." });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Не удалось начать сессию." });
    req.session.userId = user.id;
    res.json({ user: userSafe(user) });
  });
});
app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get("/api/products", (req, res) => {
  const { q = "", category = "", brand = "", color = "", size = "", min = "", max = "", sort = "" } = req.query;
  let sql = "SELECT * FROM products WHERE 1=1";
  const args = [];
  if (q) { sql += " AND (name LIKE ? OR brand LIKE ? OR description LIKE ?)"; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (category) { sql += " AND category = ?"; args.push(category); }
  if (brand) { sql += " AND brand = ?"; args.push(brand); }
  if (color) { sql += " AND color = ?"; args.push(color); }
  if (size) { sql += " AND (',' || sizes || ',') LIKE ?"; args.push(`%,${size},%`); }
  if (min !== "" && Number.isFinite(Number(min))) { sql += " AND price >= ?"; args.push(Number(min)); }
  if (max !== "" && Number.isFinite(Number(max))) { sql += " AND price <= ?"; args.push(Number(max)); }
  sql += sort === "price-asc" ? " ORDER BY price ASC" : sort === "price-desc" ? " ORDER BY price DESC" : " ORDER BY featured DESC, id DESC";
  res.json(db.prepare(sql).all(...args));
});
app.get("/api/products/:id", (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(req.params.id));
  if (!product) return res.status(404).json({ error: "Товар не найден." });
  res.json(product);
});

app.get("/api/options", (_req, res) => {
  const all = db.prepare("SELECT brand,color,sizes FROM products").all();
  const unique = key => [...new Set(all.flatMap(p => key === "sizes" ? p[key].split(",").map(x => x.trim()).filter(Boolean) : [p[key]].filter(Boolean)))].sort();
  res.json({ brands: unique("brand"), colors: unique("color"), sizes: unique("sizes") });
});

app.post("/api/orders", requireAuth, (req, res) => {
  try {
    const name = cleanText(req.body.name, 100);
    const phone = cleanText(req.body.phone, 40);
    const city = cleanText(req.body.city, 100);
    const address = cleanText(req.body.address, 300);
    const items = req.body.items;
    if (!name || !phone || !city || !address || !Array.isArray(items) || !items.length) return res.status(400).json({ error: "Заполни все поля и добавь товары в корзину." });
    if (items.length > 30) return res.status(400).json({ error: "Слишком много разных товаров в заказе." });
    let total = 0;
    const verified = [];
    for (const item of items) {
      const id = Number(item.id), qty = Math.max(1, Math.min(20, Math.floor(Number(item.qty) || 1)));
      const product = db.prepare("SELECT id,name,price FROM products WHERE id = ?").get(id);
      if (!product) return res.status(400).json({ error: "Один из товаров уже недоступен. Обнови страницу." });
      total += product.price * qty;
      verified.push({ id: product.id, name: product.name, price: product.price, qty });
    }
    const insertOrder = db.prepare("INSERT INTO orders (user_id,customer_name,phone,city,address,items_json,total,status,created_at) VALUES (?,?,?,?,?,?,?,'Новый',datetime('now'))");
    const result = insertOrder.run(currentUser(req).id, name, phone, city, address, JSON.stringify(verified), total);
    res.json({ ok: true, orderId: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: "Не удалось оформить заказ." }); }
});

app.get("/api/my-orders", requireAuth, (req, res) => {
  res.json(db.prepare("SELECT id,items_json,total,status,created_at FROM orders WHERE user_id = ? ORDER BY id DESC").all(currentUser(req).id));
});

app.get("/api/admin/products", requireAdmin, (_req, res) => res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all()));
app.post("/api/admin/products", requireAdmin, upload.single("photo"), (req, res) => {
  try {
    const product = parseProduct({ ...req.body, image: req.file ? `/uploads/${req.file.filename}` : req.body.image });
    const result = db.prepare("INSERT INTO products (name,price,category,brand,description,color,sizes,image,featured) VALUES (@name,@price,@category,@brand,@description,@color,@sizes,@image,@featured)").run(product);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: e.message || "Не удалось добавить товар." }); }
});
app.put("/api/admin/products/:id", requireAdmin, upload.single("photo"), (req, res) => {
  try {
    const old = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(req.params.id));
    if (!old) return res.status(404).json({ error: "Товар не найден." });
    const product = parseProduct({ ...req.body, image: req.file ? `/uploads/${req.file.filename}` : req.body.image }, old);
    db.prepare("UPDATE products SET name=@name,price=@price,category=@category,brand=@brand,description=@description,color=@color,sizes=@sizes,image=@image,featured=@featured WHERE id=@id").run({ ...product, id: old.id });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message || "Не удалось обновить товар." }); }
});
app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM products WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});
app.get("/api/admin/orders", requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM orders ORDER BY id DESC").all().map(o => ({ ...o, items: JSON.parse(o.items_json) })));
});
app.patch("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const status = cleanText(req.body.status, 30);
  if (!["Новый", "Подтверждён", "Отправлен", "Выполнен", "Отменён"].includes(status)) return res.status(400).json({ error: "Недопустимый статус." });
  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, Number(req.params.id));
  res.json({ ok: true });
});

app.get("*", (_req, res) => res.sendFile(path.join(ROOT, "public", "index.html")));

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "ChangeThisAdminPassword123!";
  if (!db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    const hash = await bcrypt.hash(password, 12);
    db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'admin')").run("Администратор", email, hash);
    console.log(`Создан администратор: ${email}. Измени пароль в .env перед публикацией сайта!`);
  }
}
seedAdmin().then(() => app.listen(PORT, () => console.log(`StyleHub запущен: http://localhost:${PORT}`)));
