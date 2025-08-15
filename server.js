
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const ExcelJS = require('exceljs');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());
app.use(express.static('public'));

let products = [];
let platforms = [];
let orders = [];

app.get('/api/products', (req, res) => { res.json(products); });
app.post('/api/products', (req, res) => {
    const {name, price} = req.body;
    const id = products.length+1;
    products.push({id,name,price});
    res.json({status:'ok'});
});

app.get('/api/platforms', (req,res)=>{ res.json(platforms); });
app.post('/api/platforms', (req,res)=>{
    const {name}=req.body;
    const id=platforms.length+1;
    platforms.push({id,name});
    res.json({status:'ok'});
});

app.post('/api/orders', (req,res)=>{
    const {items, platform_id} = req.body;
    const platform_name = platforms.find(p=>p.id===platform_id)?.name || '';
    const id = orders.length+1;
    const created_at = new Date().toLocaleString();
    const orderItems = items.map(i=>({...i, subtotal:(i.price-i.discount)*i.quantity}));
    orders.push({id,created_at,items:orderItems, platform_id, platform_name});
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

app.get('/api/orders/today/export', async (req,res)=>{
    const today = new Date().toDateString();
    const todayOrders = orders.filter(o=>new Date(o.created_at).toDateString()===today);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('今日订单');
    sheet.columns = [
        {header:'订单ID', key:'id'},
        {header:'平台', key:'platform_name'},
        {header:'时间', key:'created_at'},
        {header:'产品', key:'product_name'},
        {header:'数量', key:'quantity'},
        {header:'单价', key:'price'},
        {header:'优惠', key:'discount'},
        {header:'小计', key:'subtotal'}
    ];
    todayOrders.forEach(o=>{
        o.items.forEach(i=>{
            sheet.addRow({
                id:o.id, platform_name:o.platform_name, created_at:o.created_at,
                product_name:i.product_name, quantity:i.quantity, price:i.price,
                discount:i.discount, subtotal:i.subtotal
            });
        });
    });
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename=today_orders.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

app.listen(PORT,()=>console.log('Server running on port '+PORT));
