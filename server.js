
// server.js 内容 (简化示例)
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());
app.use(express.static('public'));

let products = [];
let orders = [];

app.get('/api/products', (req, res) => { res.json(products); });
app.post('/api/products', (req, res) => {
    const {name, price} = req.body;
    const id = products.length+1;
    products.push({id,name,price});
    res.json({status:'ok'});
});

app.post('/api/orders', (req, res) => {
    const items = req.body.items;
    const id = orders.length+1;
    const created_at = new Date().toLocaleString();
    const orderItems = items.map(i=>({...i, subtotal:(i.price-i.discount)*i.quantity}));
    orders.push({id,created_at,items:orderItems});
    res.json({status:'ok'});
});

app.get('/api/orders/today', (req,res)=>{
    const today = new Date().toDateString();
    const todayOrders = orders.filter(o=>new Date(o.created_at).toDateString()===today);
    let totalQty=0,totalAmount=0;
    const productMap={};
    todayOrders.forEach(o=>{
        o.items.forEach(i=>{
            totalQty+=i.quantity;
            totalAmount+=(i.price-i.discount)*i.quantity;
            if(!productMap[i.product_name]) productMap[i.product_name]={total_qty:0,total_amount:0};
            productMap[i.product_name].total_qty+=i.quantity;
            productMap[i.product_name].total_amount+=i.quantity*(i.price-i.discount);
        });
    });
    res.json({
        orderCount:todayOrders.length,
        totalQty,
        totalAmount,
        products:Object.keys(productMap).map(k=>({product_name:k,...productMap[k]})),
        orders:todayOrders
    });
});

app.listen(PORT,()=>console.log('Server running on port '+PORT));
