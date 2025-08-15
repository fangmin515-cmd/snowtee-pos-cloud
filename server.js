const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const ExcelJS = require('exceljs');
const path = require('path');

const app = express();
const PORT = 10000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // index.html 放在 public 目录

// ---------------- SQLite 初始化 ----------------
const db = new sqlite3.Database('./pos.db');

db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS platforms(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS products(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS orders(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_id INTEGER,
    created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS order_items(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    product_id INTEGER,
    product_name TEXT,
    price REAL,
    quantity INTEGER,
    discount REAL,
    subtotal REAL
  )`);
});

// ---------------- 前端页面 ----------------
app.get('/', (req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});

// ---------------- 平台接口 ----------------
app.get('/api/platforms', (req,res)=>{
  db.all('SELECT * FROM platforms', (err, rows)=>{
    if(err) return res.status(500).json({error: err.message});
    res.json(rows);
  });
});
app.post('/api/platforms', (req,res)=>{
  const { name } = req.body;
  if(!name) return res.status(400).json({error:'缺少平台名称'});
  db.run('INSERT INTO platforms(name) VALUES(?)', [name], function(err){
    if(err) return res.status(500).json({error: err.message});
    res.json({id:this.lastID, name});
  });
});

// ---------------- 产品接口 ----------------
app.get('/api/products', (req,res)=>{
  db.all('SELECT * FROM products', (err, rows)=>{
    if(err) return res.status(500).json({error: err.message});
    res.json(rows);
  });
});
app.post('/api/products', (req,res)=>{
  const { name, price } = req.body;
  if(!name || typeof price !== 'number') return res.status(400).json({error:'缺少产品名或价格'});
  db.run('INSERT INTO products(name,price) VALUES(?,?)', [name,price], function(err){
    if(err) return res.status(500).json({error: err.message});
    res.json({id:this.lastID,name,price});
  });
});

// ---------------- 订单接口 ----------------
app.post('/api/orders', (req,res)=>{
  const { platform_id, items } = req.body;
  if(!platform_id || !items || !items.length) return res.status(400).json({error:'参数错误'});
  const created_at = new Date().toISOString();
  db.run('INSERT INTO orders(platform_id, created_at) VALUES(?,?)', [platform_id, created_at], function(err){
    if(err) return res.status(500).json({error: err.message});
    const order_id = this.lastID;
    const stmt = db.prepare(`INSERT INTO order_items(order_id, product_id, product_name, price, quantity, discount, subtotal) VALUES(?,?,?,?,?,?,?)`);
    items.forEach(it=>{
      const subtotal = Number((it.price*it.quantity - it.discount).toFixed(2));
      stmt.run(order_id, it.product_id, it.product_name, it.price, it.quantity, it.discount, subtotal);
    });
    stmt.finalize();
    res.json({success:true});
  });
});

// ---------------- 当周订单汇总 ----------------
app.get('/api/orders/week-summary', (req,res)=>{
  const now = new Date();
  const day = now.getDay();
  const weekStart = new Date(now.getTime() - day*86400000).toISOString();
  db.all(`
    SELECT product_name, SUM(quantity) AS total_qty, SUM(subtotal) AS total_amount
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.created_at >= ?
    GROUP BY product_name
  `, [weekStart], (err, rows)=>{
    if(err) return res.status(500).json({error: err.message});
    res.json(rows);
  });
});

// ---------------- 当天订单明细 ----------------
app.get('/api/orders/today', (req,res)=>{
  const today = new Date().toISOString().split('T')[0];
  db.all(`
    SELECT o.id as order_id, o.platform_id, o.created_at, oi.*
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.created_at LIKE ?
  `, [`${today}%`], (err, rows)=>{
    if(err) return res.status(500).json({error: err.message});
    const orderMap = {};
    const productSummary = {};
    const platformProductSummary = {};
    rows.forEach(r=>{
      if(!orderMap[r.order_id]) orderMap[r.order_id] = {id:r.order_id, platform_id:r.platform_id, created_at:r.created_at, items:[]};
      orderMap[r.order_id].items.push({
        product_name:r.product_name,
        price:r.price,
        quantity:r.quantity,
        discount:r.discount,
        subtotal:r.subtotal
      });

      // 产品汇总
      if(!productSummary[r.product_name]) productSummary[r.product_name]={qty:0, amount:0};
      productSummary[r.product_name].qty += r.quantity;
      productSummary[r.product_name].amount += r.subtotal;

      // 平台+产品汇总
      const key = `${r.platform_id}_${r.product_name}`;
      if(!platformProductSummary[key]) platformProductSummary[key]={platform_id:r.platform_id, product_name:r.product_name, qty:0, amount:0};
      platformProductSummary[key].qty += r.quantity;
      platformProductSummary[key].amount += r.subtotal;
    });

    // 平台名称映射
    db.all('SELECT id,name FROM platforms', (err2, platforms)=>{
      if(err2) return res.status(500).json({error: err2.message});
      const platformMap = {};
      platforms.forEach(p=>platformMap[p.id]=p.name);

      res.json({
        orderCount:Object.keys(orderMap).length,
        totalQty:rows.reduce((a,b)=>a+b.quantity,0),
        totalAmount:rows.reduce((a,b)=>a+b.subtotal,0),
        productSummary:Object.entries(productSummary).map(([k,v])=>({product_name:k, qty:v.qty, amount:v.amount})),
        platformProductSummary:Object.entries(platformProductSummary).map(([k,v])=>({platform:platformMap[v.platform_id]||'未指定', ...v})),
        orders:Object.values(orderMap)
      });
    });
  });
});

// ---------------- 当天订单导出 Excel ----------------
app.get('/api/orders/today/export', async (req,res)=>{
  const today = new Date().toISOString().split('T')[0];
  db.all(`
    SELECT o.id as order_id, o.created_at, p.name AS platform_name, oi.*
    FROM orders o
    JOIN order_items oi ON oi.order_id=o.id
    JOIN platforms p ON p.id=o.platform_id
    WHERE o.created_at LIKE ?
  `, [`${today}%`], async (err, rows)=>{
    if(err) return res.status(500).send(err.message);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('今日订单');
    sheet.columns = [
      {header:'订单ID', key:'order_id', width:10},
      {header:'订单时间', key:'created_at', width:25},
      {header:'销售平台', key:'platform_name', width:15},
      {header:'产品名称', key:'product_name', width:20},
      {header:'单价', key:'price', width:10},
      {header:'数量', key:'quantity', width:10},
      {header:'优惠券金额', key:'discount', width:15},
      {header:'小计', key:'subtotal', width:10},
    ];
    rows.forEach(r=>sheet.addRow({
      order_id:r.order_id,
      created_at:r.created_at,
      platform_name:r.platform_name,
      product_name:r.product_name,
      price:r.price,
      quantity:r.quantity,
      discount:r.discount,
      subtotal:r.subtotal
    }));
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="today_orders.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  });
});

// ---------------- 历史订单导出 Excel ----------------
app.get('/api/orders/export', async (req,res)=>{
  const { start, end } = req.query;
  if(!start || !end) return res.status(400).send('缺少开始或结束日期');
  db.all(`
    SELECT o.id as order_id, o.created_at, p.name AS platform_name, oi.*
    FROM orders o
    JOIN order_items oi ON oi.order_id=o.id
    JOIN platforms p ON p.id=o.platform_id
    WHERE o.created_at BETWEEN ? AND ?
  `, [start, end], async (err, rows)=>{
    if(err) return res.status(500).send(err.message);
    if(!rows.length) return res.status(400).send('所选日期无订单');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('历史订单');
    sheet.columns = [
      {header:'订单ID', key:'order_id', width:10},
      {header:'订单时间', key:'created_at', width:25},
      {header:'销售平台', key:'platform_name', width:15},
      {header:'产品名称', key:'product_name', width:20},
      {header:'单价', key:'price', width:10},
      {header:'数量', key:'quantity', width:10},
      {header:'优惠券金额', key:'discount', width:15},
      {header:'小计', key:'subtotal', width:10},
    ];
    rows.forEach(r=>sheet.addRow({
      order_id:r.order_id,
      created_at:r.created_at,
      platform_name:r.platform_name,
      product_name:r.product_name,
      price:r.price,
      quantity:r.quantity,
      discount:r.discount,
      subtotal:r.subtotal
    }));
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="history_orders.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  });
});

app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
