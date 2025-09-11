const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

// เราจะทดสอบแค่ประตูหน้าบ้าน คือ path "/"
app.get('/', (req, res) => {
    console.log('✅✅✅ ประตูหน้าบ้าน (Root Path) ถูกเรียก!');
    res.send('<h1>Success! Server is working!</h1>');
});

// เปลี่ยนไปใช้ Port 5000 แทน 3001 เพื่อหนีปัญหา Port ชนกัน
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`🚀 Root Test Server is running on http://localhost:${PORT}`);
    console.log(`   Please test by opening your browser to http://localhost:${PORT}`);
});