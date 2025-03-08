
const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
require("dotenv").config(); // Load environment variables from .env file

const app = express();
const PORT = process.env.DB_PORT;

// Middleware to parse JSON bodies


app.post("/", async (req, res) => {
    const { FirstName, LastName, UserId, Email, Password } = req.body;

    // Basic validation
    if (!FirstName || !LastName || !UserId || !Email || !Password) {
        return res.status(400).json({ error: "All fields are required." });
    }

    // Parse UserId as an integer
    const userIdInt = parseInt(UserId, 10);
    if (isNaN(userIdInt)) {
        return res.status(400).json({ error: "UserId must be an integer." });
    }

    try {
        // Check if the user already exists
        const userCheck = await pool.query("SELECT * FROM user WHERE UserId = $1", [userIdInt]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: "User already exists." });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(Password, 10);

        // Insert the new user into the database
        const newUser = await pool.query(
            "INSERT INTO user (UserId, FirstName, LastName, Email, Password) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [userIdInt, FirstName, LastName, Email, hashedPassword]
        );

        // Return the created user
        return res.status(201).json(newUser.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json(err);
    }
});