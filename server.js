// server.js
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const ExcelJS = require('exceljs');
const app = express();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 10000;

// 初始化数据库
const db = new sqlite3.Database('./pos.db', err => {
  if(err) console.error(err);
  else console.log('Database connected');
});

// 创建表
db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS platforms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    product_id INTEGER,
    product_name TEXT,
    price REAL,
    quantity INTEGER,
    discount REAL
  )`);
});

// ----------------- 平台 API -----------------
app.get('/api/platforms', (req,res)=>{
  db.all("SELECT * FROM platforms", (err, rows)=>res.json(rows));
});
app.post('/api/platforms', (req,res)=>{
  const {name}=req.body;
  db.run("INSERT INTO platforms(name) VALUES(?)", [name], function(err){
    if(err) return res.status(500).send(err.message);
    res.json({id:this.lastID,name});
  });
});
app.delete('/api/platforms/:id', (req,res)=>{
  db.run("DELETE FROM platforms WHERE id=?", [req.params.id], err=>{
    if(err) return res.status(500).send(err.message);
    res.json({success:true});
  });
});

// ----------------- 产品 API -----------------
app.get('/api/products', (req,res)=>{
  db.all("SELECT * FROM products", (err, rows)=>res.json(rows));
});
app.post('/api/products', (req,res)=>{
  const {name,price}=req.body;
  db.run("INSERT INTO products(name,price) VALUES(?,?)",[name,price],function(err){
    if(err) return res.status(500).send(err.message);
    res.json({id:this.lastID,name,price});
  });
});
app.delete('/api/products/:id',(req,res)=>{
  db.run("DELETE FROM products WHERE id=?",[req.params.id], err=>{
    if(err) return res.status(500).send(err.message);
    res.json({success:true});
  });
});
app.put('/api/products/:id',(req,res)=>{
  const {price}=req.body;
  db.run("UPDATE products SET price=? WHERE id=?",[price,req.params.id], err=>{
    if(err) return res.status(500).send(err.message);
    res.json({success:true});
  });
});

// ----------------- 订单 API -----------------
app.post('/api/orders', (req,res)=>{
  const {platform_id, items}=req.body;
  db.run("INSERT INTO orders(platform_id) VALUES(?)",[platform_id], function(err){
    if(err) return res.status(500).send(err.message);
    const orderId=this.lastID;
    const stmt=db.prepare("INSERT INTO order_items(order_id,product_id,product_name,price,quantity,discount) VALUES(?,?,?,?,?,?)");
    items.forEach(it=>{
      stmt.run(orderId,it.product_id,it.product_name,it.price,it.quantity,it.discount);
    });
    stmt.finalize();
    res.json({orderId});
  });
});

// 修改订单行
app.put('/api/orders/:orderId/items/:itemId', (req,res)=>{
  const {quantity, discount}=req.body;
  db.run("UPDATE order_items SET quantity=?,discount=? WHERE order_id=? AND product_id=?",
    [quantity, discount, req.params.orderId, req.params.itemId],
    err=>{if(err) return res.status(500).send(err.message); res.json({success:true});});
});

// ----------------- 当周汇总 API -----------------
app.get('/api/orders/week-summary', (req,res)=>{
  db.all(`SELECT product_name,SUM(quantity) as total_qty,SUM(quantity*price - discount) as total_amount
          FROM order_items
          JOIN orders ON order_items.order_id=orders.id
          WHERE strftime('%W',orders.created_at)=strftime('%W','now')
          GROUP BY product_name`, [], (err, rows)=>res.json(rows));
});

// ----------------- 当天明细 API -----------------
app.get('/api/orders/today', (req,res)=>{
  db.all(`SELECT orders.id as orderId,orders.platform_id,orders.created_at,
          order_items.product_id, order_items.product_name, order_items.price, order_items.quantity, order_items.discount
          FROM orders
          LEFT JOIN order_items ON orders.id=order_items.order_id
          WHERE date(orders.created_at)=date('now')`, [], (err, rows)=>{
    if(err) return res.status(500).send(err.message);

    const platformMap={};
    db.all("SELECT * FROM platforms",(e,ps)=>{ps.forEach(p=>platformMap[p.id]=p.name);
      const productSummary={}; const platformProductSummary={}; const ordersMap={};

      rows.forEach(r=>{
        if(!ordersMap[r.orderId]) ordersMap[r.orderId]={id:r.orderId,platform_name:platformMap[r.platform_id],items:[]};
        ordersMap[r.orderId].items.push({product_id:r.product_id,product_name:r.product_name,price:r.price,quantity:r.quantity,discount:r.discount,subtotal:r.price*r.quantity-r.discount});

        productSummary[r.product_name]=(productSummary[r.product_name]||{qty:0,amount:0});
        productSummary[r.product_name].qty+=r.quantity;
        productSummary[r.product_name].amount+=r.price*r.quantity-r.discount;

        const key=(platformMap[r.platform_id]||'未指定')+'-'+r.product_name;
        platformProductSummary[key]=(platformProductSummary[key]||{platform:platformMap[r.platform_id]||'未指定',product_name:r.product_name,qty:0,amount:0});
        platformProductSummary[key].qty+=r.quantity;
        platformProductSummary[key].amount+=r.price*r.quantity-r.discount;
      });

      res.json({
        orderCount:Object.keys(ordersMap).length,
        totalQty:rows.reduce((s,r)=>s+r.quantity,0),
        totalAmount:rows.reduce((s,r)=>s+r.price*r.quantity-r.discount,0),
        productSummary:Object.values(productSummary),
        platformProductSummary:Object.values(platformProductSummary),
        orders:Object.values(ordersMap)
      });
    });
  });
});

// 导出当天 Excel
app.get('/api/orders/today/export', async (req,res)=>{
  const data = await new Promise((resolve,reject)=>{
    db.all(`SELECT orders.id as orderId,orders.platform_id,orders.created_at,
            order_items.product_id, order_items.product_name, order_items.price, order_items.quantity, order_items.discount
            FROM orders
            LEFT JOIN order_items ON orders.id=order_items.order_id
            WHERE date(orders.created_at)=date('now')`, [], (err,rows)=>err?reject(err):resolve(rows));
  });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('今日订单');
  sheet.columns=[
    {header:'订单ID',key:'orderId',width:10},
    {header:'时间',key:'created_at',width:20},
    {header:'产品',key:'product_name',width:20},
    {header:'单价',key:'price',width:10},
    {header:'数量',key:'quantity',width:10},
    {header:'优惠',key:'discount',width:10},
    {header:'小计',key:'subtotal',width:10},
    {header:'平台',key:'platform',width:15}
  ];
  const platformMap={};
  db.all("SELECT * FROM platforms",(e,ps)=>{ps.forEach(p=>platformMap[p.id]=p.name);
    data.forEach(r=>{
      sheet.addRow({
        orderId:r.orderId,
        created_at:r.created_at,
        product_name:r.product_name,
        price:r.price,
        quantity:r.quantity,
        discount:r.discount,
        subtotal:r.price*r.quantity-r.discount,
        platform:platformMap[r.platform_id]||'未指定'
      });
    });
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="today_orders.xlsx"');
    workbook.xlsx.write(res).then(()=>res.end());
  });
});

// ----------------- 首页 -----------------
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'index.html')));

app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
