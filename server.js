const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database(path.join(__dirname, 'pos.db'));

// Initialize DB
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS platforms (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)`);
  db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, price REAL)`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, platform_id INTEGER, total REAL, created_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, product_id INTEGER, product_name TEXT, price REAL, quantity INTEGER, discount REAL, subtotal REAL)`);
});

// Platforms
app.get('/api/platforms', (req, res) => {
  db.all(\"SELECT * FROM platforms ORDER BY id DESC\", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.post('/api/platforms', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  db.run(\"INSERT OR IGNORE INTO platforms(name) VALUES(?)\", [name], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

// Products
app.get('/api/products', (req, res) => {
  db.all(\"SELECT * FROM products ORDER BY id DESC\", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.post('/api/products', (req, res) => {
  const { name, price } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'name & price required' });
  db.run(\"INSERT OR IGNORE INTO products(name, price) VALUES(?, ?)\", [name, price], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

// Create order (items: [{product_id, product_name, price, quantity, discount}], platform_id)
app.post('/api/orders', (req, res) => {
  const { items, platform_id } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'items required' });
  const created_at = new Date().toISOString();
  let total = 0;
  const preparedItems = items.map(it => {
    const subtotal = (Number(it.price) - Number(it.discount || 0)) * Number(it.quantity);
    total += subtotal;
    return Object.assign({}, it, { subtotal });
  });

  db.run(\"INSERT INTO orders(platform_id, total, created_at) VALUES(?, ?, ?)\", [platform_id || null, total, created_at], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    const orderId = this.lastID;
    const stmt = db.prepare(\"INSERT INTO order_items(order_id, product_id, product_name, price, quantity, discount, subtotal) VALUES(?,?,?,?,?,?,?)\");
    preparedItems.forEach(it => {
      stmt.run(orderId, it.product_id || null, it.product_name, it.price, it.quantity, it.discount || 0, it.subtotal);
    });
    stmt.finalize();
    res.json({ id: orderId });
  });
});

// Helper: get today's orders and summaries
app.get('/api/orders/today', (req, res) => {
  // use localtime date
  db.all(\"SELECT * FROM orders WHERE date(created_at) = date('now','localtime') ORDER BY id DESC\", [], (err, orders) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!orders.length) return res.json({ orderCount: 0, totalQty: 0, totalAmount: 0, productSummary: [], platformProductSummary: [], orders: [] });

    const orderIds = orders.map(o => o.id).join(',');
    db.all(`SELECT oi.*, o.platform_id, p.name as platform_name
            FROM order_items oi
            LEFT JOIN orders o ON oi.order_id = o.id
            LEFT JOIN platforms p ON o.platform_id = p.id
            WHERE oi.order_id IN (${orderIds}) ORDER BY oi.id DESC`, [], (err2, items) => {
      if (err2) return res.status(500).json({ error: err2.message });

      // productSummary
      const productMap = {};
      const platformProductMap = {}; // product by platform
      let totalQty = 0, totalAmount = 0;
      items.forEach(it => {
        totalQty += Number(it.quantity);
        totalAmount += Number(it.subtotal);
        if (!productMap[it.product_name]) productMap[it.product_name] = { product_name: it.product_name, qty: 0, amount: 0 };
        productMap[it.product_name].qty += Number(it.quantity);
        productMap[it.product_name].amount += Number(it.subtotal);

        const platformName = it.platform_name || '未指定平台';
        const key = platformName + '||' + it.product_name;
        if (!platformProductMap[key]) platformProductMap[key] = { platform: platformName, product_name: it.product_name, qty: 0, amount: 0 };
        platformProductMap[key].qty += Number(it.quantity);
        platformProductMap[key].amount += Number(it.subtotal);
      });

      // build orders with items
      const ordersMap = {};
      orders.forEach(o => ordersMap[o.id] = Object.assign({}, o, { items: [] }));
      items.forEach(it => {
        if (ordersMap[it.order_id]) ordersMap[it.order_id].items.push(it);
      });

      res.json({
        orderCount: orders.length,
        totalQty,
        totalAmount,
        productSummary: Object.values(productMap),
        platformProductSummary: Object.values(platformProductMap),
        orders: Object.values(ordersMap)
      });
    });
  });
});

// Weekly summary (current calendar week by localtime)
app.get('/api/orders/week-summary', (req, res) => {
  // group by product for current week (strftime '%W' week number)
  db.all(`SELECT oi.product_name,
                 SUM(oi.quantity) AS total_qty,
                 SUM(oi.subtotal) AS total_amount
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE strftime('%W', o.created_at, 'localtime') = strftime('%W', 'now','localtime')
            AND strftime('%Y', o.created_at, 'localtime') = strftime('%Y','now','localtime')
          GROUP BY oi.product_name
          ORDER BY total_amount DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Export today's orders as CSV (Excel can open)
app.get('/api/orders/today/export', (req, res) => {
  db.all(\"SELECT * FROM orders WHERE date(created_at) = date('now','localtime') ORDER BY id DESC\", [], (err, orders) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!orders.length) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=today_orders.csv');
      return res.send('订单ID,销售平台,订单时间,产品名称,单价,数量,优惠券金额,小计\\n');
    }
    const orderIds = orders.map(o => o.id).join(',');
    db.all(`SELECT oi.*, o.platform_id, p.name as platform_name, o.created_at
            FROM order_items oi
            LEFT JOIN orders o ON oi.order_id = o.id
            LEFT JOIN platforms p ON o.platform_id = p.id
            WHERE oi.order_id IN (${orderIds})
            ORDER BY oi.id DESC`, [], (err2, items) => {
      if (err2) return res.status(500).json({ error: err2.message });
      let csv = '订单ID,销售平台,订单时间,产品名称,单价,数量,优惠券金额,小计\\r\\n';
      items.forEach(it => {
        csv += `${it.order_id},${(it.platform_name||'未指定').replace(/,/g,'')},${it.created_at},${(it.product_name||'').replace(/,/g,'')},${it.price},${it.quantity},${it.discount},${it.subtotal}\\r\\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=today_orders.csv');
      res.send(csv);
    });
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
