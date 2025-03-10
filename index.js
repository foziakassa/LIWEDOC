const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();  // Create an instance of Express
const PORT = process.env.PORT || 3000;

// PostgreSQL connection setup
const pool = new Pool({
    user: process.env.DB_USER,                   // "avnadmin"
    host: process.env.DB_HOST,                   // "pg-245db9db-foziakassa19-019c.d.aivencloud.com"
    database: process.env.DB_NAME,               // "defaultdb"
    password: process.env.DB_PASSWORD,           // Your actual password
    port: parseInt(process.env.DB_PORT, 10),    // 19193
    ssl: {
        rejectUnauthorized: true,                // Adjust for production as needed
    },
});

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Test database connection
pool.connect()
    .then(client => {
        console.log("Connected to the database.");
        client.release();
    })
    .catch(err => {
        console.error("Database connection error:", err);
    });

// GET route to retrieve all users
app.get("/users", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM \"User\"");
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// POST route to create a new user
app.post("/users", async (req, res) => {
    const { FirstName, LastName, UserId, Email, Password } = req.body;

    // Validate input
    if (!FirstName || !LastName || !UserId || !Email || !Password) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        // Check if the user already exists
        const userCheck = await pool.query("SELECT * FROM \"User\" WHERE \"UserId\" = $1", [UserId]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: "User already exists." });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(Password, 10);

        // Insert the new user into the database
        const newUser = await pool.query(
            "INSERT INTO \"User\" (\"UserId\", \"FirstName\", \"LastName\", \"Email\", \"password\") VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [UserId, FirstName, LastName, Email, hashedPassword]
        );

        // Return the created user
        return res.status(201).json(newUser.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}.`);
});