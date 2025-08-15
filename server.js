
// Node.js 示例 server 文件（实际应包含平台、产品、订单录入及导出Excel的API逻辑）
const express = require('express');
const app = express();
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.listen(10000, () => console.log('Server running on port 10000'));
