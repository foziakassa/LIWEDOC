const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const emailExistence = require("email-existence"); // Import the email-existence library
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
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

// Email validation function
const isValidEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
};

// GET route to retrieve all users
app.get("/users", (req, res) => {
    res.send("hi there");
});

// POST route to create a new user
app.post("/users", async (req, res) => {
    const { Firstname, Lastname, Email, Password } = req.body;

    if (!Firstname || !Lastname || !Email || !Password) {
        return res.status(400).json({ error: "All fields are required." });
    }

    // Validate email format
    if (!isValidEmail(Email)) {
        return res.status(400).json({ error: "Invalid email format." });
    }

    // Check if the email exists
    emailExistence.check(Email, async (error, response) => {
        if (error) {
            return res.status(500).json({ error: "Internal Server Error" });
        }

        if (!response) {
            return res.status(400).json({ error: "Email does not exist." });
        }

        try {
            // Check for existing user with the provided email
            const userCheck = await pool.query("SELECT * FROM \"users\" WHERE \"Email\" = $1", [Email]);
            if (userCheck.rows.length > 0) {
                return res.status(400).json({ error: "User  already exists." });
            }

            const hashedPassword = await bcrypt.hash(Password, 10);
            const newUser  = await pool.query(
                "INSERT INTO \"users\" (\"Firstname\", \"Lastname\", \"Email\", \"Password\") VALUES ($1, $2, $3, $4) RETURNING *",
                [Firstname, Lastname, Email, hashedPassword]
            );

            return res.status(201).json(newUser .rows[0]);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}.`);
});