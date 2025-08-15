const express = require("express");
const bodyParser = require("body-parser");
const Database = require("better-sqlite3");
const ExcelJS = require("exceljs");
const path = require("path");

const app = express();
const db = new Database("pos.db");

app.use(bodyParser.json());
app.use(express.static("public"));

// 数据库初始化
db.prepare(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  price REAL,
  platform TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS platforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  items TEXT,
  total REAL,
  platform TEXT,
  created_at TEXT
)
`).run();

// 获取产品列表
app.get("/api/products", (req,res)=>{
  const rows = db.prepare("SELECT * FROM products").all();
  res.json(rows);
});

// 添加新产品
app.post("/api/products", (req,res)=>{
  const {name, price, platform} = req.body;
  const stmt = db.prepare("INSERT INTO products(name,price,platform) VALUES(?,?,?)");
  const info = stmt.run(name,price,platform);
  res.json({id:info.lastInsertRowid});
});

// 获取平台列表
app.get("/api/platforms", (req,res)=>{
  const rows = db.prepare("SELECT * FROM platforms").all();
  res.json(rows);
});

// 添加新平台
app.post("/api/platforms", (req,res)=>{
  const {name} = req.body;
  const stmt = db.prepare("INSERT INTO platforms(name) VALUES(?)");
  const info = stmt.run(name);
  res.json({id:info.lastInsertRowid});
});

// 保存新订单
app.post("/api/orders", (req,res)=>{
  const {items, total, platform} = req.body;
  const stmt = db.prepare("INSERT INTO orders(items,total,platform,created_at) VALUES(?,?,?,?)");
  stmt.run(JSON.stringify(items), total, platform, new Date().toISOString());
  res.json({status:"ok"});
});

// 获取当日订单
app.get("/api/orders/today",(req,res)=>{
  const today = new Date().toISOString().slice(0,10);
  const rows = db.prepare("SELECT * FROM orders WHERE created_at LIKE ?").all(`${today}%`);
  res.json(rows);
});

// 导出 Excel
app.get("/api/orders/export",(req,res)=>{
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Orders");
  sheet.addRow(["ID","Items","Total","Platform","Created At"]);

  const rows = db.prepare("SELECT * FROM orders").all();
  rows.forEach(r=>{
    sheet.addRow([r.id, r.items, r.total, r.platform, r.created_at]);
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=orders.xlsx"
  );

  workbook.xlsx.write(res).then(()=>res.end());
});

// 启动服务
const PORT = process.env.PORT || 10000;
app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));// server.js 完整内容，包含产品、平台、订单API，支持多产品订单和导出Excel
