const express = require('express');
const app = express();
const port = 3000;

app.use(express.json()); // Middleware for parsing JSON

let products = []; // Array to store products

app.post('/products', (req, res) => {
    const product = req.body;
    products.push(product);
    res.status(201).send(product);
});

app.get('/products', (req, res) => {
    res.send("hi there ");
});

app.get('/products/:id', (req, res) => {
    const product = products.find(p => p.id === parseInt(req.params.id));
    if (!product) return res.status(404).send('Product not found');
    res.send(product);
});

app.put('/products/:id', (req, res) => {
    const product = products.find(p => p.id === parseInt(req.params.id));
    if (!product) return res.status(404).send('Product not found');
    
    Object.assign(product, req.body); // Update product details
    res.send(product);
});

app.delete('/products/:id', (req, res) => {
    const productIndex = products.findIndex(p => p.id === parseInt(req.params.id));
    if (productIndex === -1) return res.status(404).send('Product not found');
    
    products.splice(productIndex, 1); // Remove product from array
    res.status(204).send(); // No content
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
