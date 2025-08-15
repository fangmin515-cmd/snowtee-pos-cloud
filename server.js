const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const ExcelJS = require('exceljs');
const cors = require('cors');

const app = express();
const db = new sqlite3.Database('./pos.db');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// 初始化数据库
db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS platforms (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL)`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, platform_id INTEGER, created_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, product_id INTEGER, product_name TEXT, price REAL, quantity INTEGER, discount REAL, subtotal REAL)`);
});

// 首页
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

/* ====================== 平台接口 ====================== */
app.get('/api/platforms',(req,res)=>{
  db.all('SELECT * FROM platforms',[],(err,rows)=>res.json(rows));
});

app.post('/api/platforms',(req,res)=>{
  const { name } = req.body;
  db.run('INSERT INTO platforms(name) VALUES(?)',[name],function(err){
    if(err) return res.status(500).json({error:err.message});
    res.json({id:this.lastID,name});
  });
});

app.delete('/api/platforms/:id',(req,res)=>{
  const id = req.params.id;
  db.run('DELETE FROM platforms WHERE id=?',[id],err=>{
    if(err) return res.status(500).json({error:err.message});
    res.json({success:true});
  });
});

/* ====================== 产品接口 ====================== */
app.get('/api/products',(req,res)=>{
  db.all('SELECT * FROM products',[],(err,rows)=>res.json(rows));
});

app.post('/api/products',(req,res)=>{
  const { name, price } = req.body;
  db.run('INSERT INTO products(name,price) VALUES(?,?)',[name,price],function(err){
    if(err) return res.status(500).json({error:err.message});
    res.json({id:this.lastID,name,price});
  });
});

app.delete('/api/products/:id',(req,res)=>{
  const id = req.params.id;
  db.run('DELETE FROM products WHERE id=?',[id],err=>{
    if(err) return res.status(500).json({error:err.message});
    res.json({success:true});
  });
});

app.put('/api/products/:id',(req,res)=>{
  const id = req.params.id;
  const { price } = req.body;
  db.run('UPDATE products SET price=? WHERE id=?',[price,id],err=>{
    if(err) return res.status(500).json({error:err.message});
    res.json({success:true});
  });
});

/* ====================== 订单接口 ====================== */
app.post('/api/orders',(req,res)=>{
  const { platform_id, items } = req.body;
  const created_at = new Date().toISOString();
  db.run('INSERT INTO orders(platform_id,created_at) VALUES(?,?)',[platform_id,created_at], function(err){
    if(err) return res.status(500).json({error:err.message});
    const orderId = this.lastID;
    const stmt = db.prepare('INSERT INTO order_items(order_id
