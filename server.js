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

// 订单相关API（支持优惠券折扣）
app.post('/api/orders', (req, res) => {
    const { items, discount = 0, channel } = req.body;
    const id = nanoid();
    const date = new Date().toISOString().split('T')[0];
    
    let total = 0;
    items.forEach(item => { total += item.price * item.qty; });
    total = total - discount;

    db.prepare('INSERT INTO orders (id, items, total, channel, date) VALUES (?, ?, ?, ?, ?)')
      .run(id, JSON.stringify(items), total, channel, date);

    res.json({ id, total });
});

const frontend_html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Snowtee POS 云端版</title>
<style>
body { font-family: Arial, sans-serif; margin: 20px; background: #fafafa; }
h1 { color: #333; }
label { display: block; margin-top: 10px; }
input, select, button { padding: 8px; margin-top: 5px; }
table { width: 100%; border-collapse: collapse; margin-top: 15px; }
table, th, td { border: 1px solid #ccc; }
th, td { padding: 8px; text-align: left; }
</style>
</head>
<body>
<h1>Snowtee POS 云端版</h1>

<section id="product-section">
    <h2>产品管理</h2>
    <label>产品名称 <input id="prod-name"></label>
    <label>价格 <input id="prod-price" type="number" step="0.01"></label>
    <button onclick="addProduct()">添加产品</button>
    <table id="product-table"><thead><tr><th>名称</th><th>价格</th></tr></thead><tbody></tbody></table>
</section>

<section id="order-section">
    <h2>订单录入</h2>
    <label>产品 <select id="order-product"></select></label>
    <label>数量 <input id="order-qty" type="number" value="1"></label>
    <label>渠道 
        <select id="order-channel">
            <option>门店</option>
            <option>Grab</option>
            <option>Foodpanda</option>
            <option>Lineman</option>
        </select>
    </label>
    <label>优惠券金额 <input id="order-discount" type="number" step="0.01" value="0"></label>
    <button onclick="addOrder()">保存订单</button>
</section>

<script>
const API = location.origin + '/api';

async function loadProducts() {
    const res = await fetch(API + '/products');
    const products = await res.json();
    const tbody = document.querySelector('#product-table tbody');
    const select = document.querySelector('#order-product');
    tbody.innerHTML = '';
    select.innerHTML = '';
    products.forEach(p => {
        tbody.innerHTML += `<tr><td>${p.name}</td><td>${p.price}</td></tr>`;
        select.innerHTML += `<option value="${p.id}" data-price="${p.price}">${p.name}</option>`;
    });
}

async function addProduct() {
    const name = document.getElementById('prod-name').value;
    const price = parseFloat(document.getElementById('prod-price').value);
    if (!name || isNaN(price)) return alert('请填写完整产品信息');
    await fetch(API + '/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price })
    });
    loadProducts();
}

async function addOrder() {
    const prodSelect = document.getElementById('order-product');
    const prodId = prodSelect.value;
    const prodName = prodSelect.options[prodSelect.selectedIndex].text;
    const price = parseFloat(prodSelect.options[prodSelect.selectedIndex].dataset.price);
    const qty = parseInt(document.getElementById('order-qty').value);
    const channel = document.getElementById('order-channel').value;
    const discount = parseFloat(document.getElementById('order-discount').value) || 0;

    if (!prodId || qty <= 0) return alert('请选择产品并填写数量');

    const items = [{ id: prodId, name: prodName, price, qty }];
    
    const res = await fetch(API + '/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, discount, channel })
    });
    const data = await res.json();
    alert('订单已保存，总价: ' + data.total);
}

loadProducts();
</script>
</body>
</html>`;

app.get('/', (req, res) => { res.send(frontend_html); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
