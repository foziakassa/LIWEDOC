
const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
require("dotenv").config(); // Load environment variables from .env file

const app = express();
const PORT = process.env.DB_PORT;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// PostgreSQL connection setup
const pool = new Pool({
    user: process.env.DB_USER,    // PostgreSQL username from environment variable
    host: process.env.DB_HOST,     // Host from environment variable
    database: process.env.DB_NAME,  // Your database name from environment variable
    password: process.env.DB_PASSWORD, // PostgreSQL password from environment variable
    port: parseInt(process.env.DB_PORT, 10),      // PostgreSQfnjntuirutgitjrngnrgnngnrruntggnL port from environment variable
});

// POST API to create a new user


app.post("/", async (req, res) => {
    const { FirstName, LastName, UserId, Email, Password } = req.body;

    // Basic validation
    if (!FirstName || !LastName || !UserId || !Email || !Password) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        // Check if the user already exists
        const userCheck = await pool.query("SELECT * FROM user WHERE UserId = $1", [UserId]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: "User already exists." });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(Password, 10);

        // Insert the new user into the database
        const newUser = await pool.query(
            "INSERT INTO user (UserId, FirstName, LastName, Email, Password) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [ FirstName, LastName, Email,UserId, hashedPassword]
        );

        // Return the created user
        return res.status(201).json(newUser.rows[0]);
    } catch (err) {
        console.error(err);
       
        return res.status(500).json(err);
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("PostgreSQL Pool Configuration:");
console.log(`User: ${process.env.DB_USER}`);
console.log(`Host: ${process.env.DB_HOST}`);
console.log(`Database: ${process.env.DB_NAME}`);
console.log(`Password: ${process.env.DB_PASSWORD ? "*****" : "Not Set"}`); // Mask the password
console.log(`Port: ${process.env.DB_PORT}`);
});