const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const excelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());
app.use(express.static('public'));

const dbFile = path.join(__dirname, 'pos.db');
const dbExists = fs.existsSync(dbFile);
const db = new sqlite3.Database(dbFile);

if (!dbExists) {
    db.serialize(() => {
        db.run(`CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL)`);
        db.run(`CREATE TABLE platforms (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);
        db.run(`CREATE TABLE orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform_id INTEGER,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )`);
        db.run(`CREATE TABLE order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER,
            product_id INTEGER,
            product_name TEXT,
            price REAL,
            quantity INTEGER,
            discount REAL
        )`);
    });
}

// 产品接口
app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM products", (err, rows) => res.json(rows));
});
app.post('/api/products', (req, res) => {
    const { name, price } = req.body;
    db.run("INSERT INTO products(name, price) VALUES(?,?)", [name, price], function(err){
        if(err) return res.status(500).json({error:err});
        res.json({id: this.lastID});
    });
});

// 平台接口
app.get('/api/platforms', (req, res) => {
    db.all("SELECT * FROM platforms", (err, rows) => res.json(rows));
});
app.post('/api/platforms', (req, res) => {
    const { name } = req.body;
    db.run("INSERT INTO platforms(name) VALUES(?)", [name], function(err){
        if(err) return res.status(500).json({error:err});
        res.json({id: this.lastID});
    });
});

// 新订单
app.post('/api/orders', (req, res) => {
    const { items, platform_id } = req.body;
    db.run("INSERT INTO orders(platform_id) VALUES(?)", [platform_id], function(err){
        if(err) return res.status(500).json({error:err});
        const orderId = this.lastID;
        const stmt = db.prepare("INSERT INTO order_items(order_id, product_id, product_name, price, quantity, discount) VALUES(?,?,?,?,?,?)");
        items.forEach(item => {
            stmt.run(orderId, item.product_id, item.product_name, item.price, item.quantity, item.discount);
        });
        stmt.finalize();
        res.json({id: orderId});
    });
});

// 获取当天订单
app.get('/api/orders/today', (req,res)=>{
    const today = new Date().toISOString().split('T')[0];
    db.all(`
        SELECT o.id,o.platform_id,o.created_at,p.name as platform_name
        FROM orders o LEFT JOIN platforms p ON o.platform_id=p.id
        WHERE date(o.created_at)=?
        `, [today], (err, orders)=>{
        if(err) return res.status(500).json({error:err});
        const orderIds = orders.map(o=>o.id);
        if(orderIds.length===0) return res.json({orders:[], orderCount:0, totalQty:0, totalAmount:0, products:[]});
        db.all(`SELECT * FROM order_items WHERE order_id IN (${orderIds.join(',')})`, (err2, items)=>{
            if(err2) return res.status(500).json({error:err2});
            const ordersMap = {};
            orders.forEach(o=>ordersMap[o.id]={...o, items:[]});
            items.forEach(i=>ordersMap[i.order_id].items.push(i));
            const ordersArray = Object.values(ordersMap);
            // 当日统计
            let orderCount = ordersArray.length, totalQty=0, totalAmount=0;
            const productMap = {};
            items.forEach(i=>{
                totalQty+=i.quantity;
                totalAmount+=(i.price*i.quantity - i.discount);
                if(!productMap[i.product_name]) productMap[i.product_name]={product_name:i.product_name,total_qty:0,total_amount:0};
                productMap[i.product_name].total_qty += i.quantity;
                productMap[i.product_name].total_amount += (i.price*i.quantity - i.discount);
            });
            res.json({orders:ordersArray, orderCount, totalQty, totalAmount, products:Object.values(productMap)});
        });
    });
});

// 导出 Excel
app.get('/api/orders/today/export', async (req,res)=>{
    const today = new Date().toISOString().split('T')[0];
    db.all(`
        SELECT o.id,o.platform_id,o.created_at,p.name as platform_name,oi.product_name,oi.price,oi.quantity,oi.discount
        FROM orders o 
        LEFT JOIN platforms p ON o.platform_id=p.id
        LEFT JOIN order_items oi ON oi.order_id=o.id
        WHERE date(o.created_at)=?
    `,[today], async (err, rows)=>{
        if(err) return res.status(500).json({error:err});
        const workbook = new excelJS.Workbook();
        const worksheet = workbook.addWorksheet('当日订单');
        worksheet.columns = [
            {header:'订单ID', key:'id', width:10},
            {header:'平台', key:'platform_name', width:15},
            {header:'时间', key:'created_at', width:20},
            {header:'产品', key:'product_name', width:20},
            {header:'单价', key:'price', width:10},
            {header:'数量', key:'quantity', width:10},
            {header:'优惠', key:'discount', width:10},
            {header:'小计', key:'subtotal', width:15}
        ];
        rows.forEach(r=>worksheet.addRow({...r, subtotal: r.price*r.quantity - r.discount}));
        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition','attachment; filename=orders.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    });
});

app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
