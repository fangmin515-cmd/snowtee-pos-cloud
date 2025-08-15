const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { nanoid } = require('nanoid');

const app = express();
app.use(cors());
app.use(express.json());

const db = new Database('db.sqlite');

// 初始化数据表
db.prepare(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT,
    price REAL
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    items TEXT,
    total REAL,
    channel TEXT,
    date TEXT
)`).run();

// 产品相关API
app.get('/api/products', (req, res) => {
    const rows = db.prepare('SELECT * FROM products').all();
    res.json(rows);
});

app.post('/api/products', (req, res) => {
    const { name, price } = req.body;
    const id = nanoid();
    db.prepare('INSERT INTO products (id, name, price) VALUES (?, ?, ?)').run(id, name, price);
    res.json({ id, name, price });
});

// 订单相关API
app.post('/api/orders', (req, res) => {
    const { items, total, channel } = req.body;
    const id = nanoid();
    const date = new Date().toISOString().split('T')[0];
    db.prepare('INSERT INTO orders (id, items, total, channel, date) VALUES (?, ?, ?, ?, ?)')
      .run(id, JSON.stringify(items), total, channel, date);
    res.json({ id });
});

app.get('/', (req, res) => {
    res.send("<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>Snowtee POS \u4e91\u7aef\u7248</title>\n<style>\nbody { font-family: Arial, sans-serif; margin: 20px; background: #fafafa; }\nh1 { color: #333; }\nlabel { display: block; margin-top: 10px; }\ninput, select, button { padding: 8px; margin-top: 5px; }\ntable { width: 100%; border-collapse: collapse; margin-top: 15px; }\ntable, th, td { border: 1px solid #ccc; }\nth, td { padding: 8px; text-align: left; }\n</style>\n</head>\n<body>\n<h1>Snowtee POS \u4e91\u7aef\u7248</h1>\n<section id=\"product-section\">\n    <h2>\u4ea7\u54c1\u7ba1\u7406</h2>\n    <label>\u4ea7\u54c1\u540d\u79f0 <input id=\"prod-name\"></label>\n    <label>\u4ef7\u683c <input id=\"prod-price\" type=\"number\" step=\"0.01\"></label>\n    <button onclick=\"addProduct()\">\u6dfb\u52a0\u4ea7\u54c1</button>\n    <table id=\"product-table\"><thead><tr><th>\u540d\u79f0</th><th>\u4ef7\u683c</th></tr></thead><tbody></tbody></table>\n</section>\n<section id=\"order-section\">\n    <h2>\u8ba2\u5355\u5f55\u5165</h2>\n    <label>\u4ea7\u54c1 <select id=\"order-product\"></select></label>\n    <label>\u6570\u91cf <input id=\"order-qty\" type=\"number\" value=\"1\"></label>\n    <label>\u6e20\u9053 \n        <select id=\"order-channel\">\n            <option>\u95e8\u5e97</option>\n            <option>Grab</option>\n            <option>Foodpanda</option>\n            <option>Lineman</option>\n        </select>\n    </label>\n    <button onclick=\"addOrder()\">\u4fdd\u5b58\u8ba2\u5355</button>\n</section>\n<script>\nconst API = location.origin + '/api';\n\nasync function loadProducts() {\n    const res = await fetch(API + '/products');\n    const products = await res.json();\n    const tbody = document.querySelector('#product-table tbody');\n    const select = document.querySelector('#order-product');\n    tbody.innerHTML = '';\n    select.innerHTML = '';\n    products.forEach(p => {\n        tbody.innerHTML += `<tr><td>${p.name}</td><td>${p.price}</td></tr>`;\n        select.innerHTML += `<option value=\"${p.id}\" data-price=\"${p.price}\">${p.name}</option>`;\n    });\n}\n\nasync function addProduct() {\n    const name = document.getElementById('prod-name').value;\n    const price = parseFloat(document.getElementById('prod-price').value);\n    if (!name || isNaN(price)) return alert('\u8bf7\u586b\u5199\u5b8c\u6574\u4ea7\u54c1\u4fe1\u606f');\n    await fetch(API + '/products', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ name, price })\n    });\n    loadProducts();\n}\n\nasync function addOrder() {\n    const prodSelect = document.getElementById('order-product');\n    const prodId = prodSelect.value;\n    const prodName = prodSelect.options[prodSelect.selectedIndex].text;\n    const price = parseFloat(prodSelect.options[prodSelect.selectedIndex].dataset.price);\n    const qty = parseInt(document.getElementById('order-qty').value);\n    const channel = document.getElementById('order-channel').value;\n    if (!prodId || qty <= 0) return alert('\u8bf7\u9009\u62e9\u4ea7\u54c1\u5e76\u586b\u5199\u6570\u91cf');\n    const items = [{ id: prodId, name: prodName, price, qty }];\n    const total = price * qty;\n    await fetch(API + '/orders', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ items, total, channel })\n    });\n    alert('\u8ba2\u5355\u5df2\u4fdd\u5b58');\n}\n\nloadProducts();\n</script>\n</body>\n</html>");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
