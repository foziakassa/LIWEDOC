const express = require('express');
const app = express();
const port = 3000;

app.get('/message', (req, res) => {
    res.send('Hi there!');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});