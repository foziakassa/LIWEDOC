const express = require("express");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
    user: process.env.DB_USER,                   
    host: process.env.DB_HOST,                   
    database: process.env.DB_NAME,               
    password: process.env.DB_PASSWORD,           
    port: parseInt(process.env.DB_PORT, 10),    
    ssl: {
        rejectUnauthorized: false,                
    },
});

// Test connection
pool.connect()
    .then(client => {
        console.log("Connected to the database.");
        client.release();
    })
    .catch(err => {
        console.error("Database connection error:", err);
    });

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}.`);
});