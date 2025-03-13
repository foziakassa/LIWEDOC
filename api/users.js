const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
require("dotenv").config();

const router = express.Router();
router.use(bodyParser.json());

// PostgreSQL connection setup
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// GET API for users
router.get("/", (req, res) => {
    res.send("User endpoint");
});

// POST API to create a new user
router.post("/", async (req, res) => {
    const { FirstName, LastName, UserId, Email, Password } = req.body;

    // Basic validation
    if (!FirstName || !LastName || !UserId || !Email || !Password) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        // Check if the user already exists
        const userCheck = await pool.query("SELECT * FROM users WHERE UserId = $1", [UserId]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: "User already exists." });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(Password, 10);

        // Insert the new user into the database
        const newUser = await pool.query(
            "INSERT INTO users (UserId, FirstName, LastName, Email, Password) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [UserId, FirstName, LastName, Email, hashedPassword]
        );

        // Return the created user
        return res.status(201).json(newUser.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Database error." });
    }
});

module.exports = router;
