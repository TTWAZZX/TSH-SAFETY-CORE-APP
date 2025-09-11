const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

// Middleware ดักฟังทุก request
app.use((req, res, next) => {
    console.log(`➡️  Incoming Request: ${req.method} ${req.originalUrl}`);
    next();
});

app.get('/api/test', (req, res) => {
    console.log('✅ /api/test endpoint was hit successfully!');
    res.json({ message: 'Hello from the keep-alive test server!' });
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`🚀 Keep-Alive Test Server is running on http://localhost:${PORT}`);
});

// โค้ดส่วน Keep-alive: จะพิมพ์ข้อความทุก 10 วินาทีเพื่อกันไม่ให้ process จบการทำงาน
setInterval(() => {
    console.log('Server is alive...');
}, 10000);