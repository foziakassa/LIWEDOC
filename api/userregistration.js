const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const cors = require("cors");
const multer = require("multer");
require("dotenv").config();
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

console.log("Connecting to database with URL:", process.env.DATABASE_URL);

// Configure nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Your Gmail address
        pass: 'heen oxfi tpuq vezd'   // Your app password
    }
});

// PostgreSQL connection setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

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
        const users = await pool.query("SELECT * FROM \"user\" WHERE \"DeletedAt\" IS NULL");
        res.status(200).json(users.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// POST route to create a new user
app.post("/users", async (req, res) => {
    const { Firstname, Lastname, Email, Password } = req.body;

    if (!Firstname || !Lastname || !Email || !Password) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        const userCheck = await pool.query("SELECT * FROM \"user\" WHERE \"Email\" = $1", [Email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: "User  already exists." });
        }

        const hashedPassword = await bcrypt.hash(Password, 10);
        const newUser  = await pool.query(
            "INSERT INTO \"user\" (\"Firstname\", \"Lastname\", \"Email\", \"Password\", \"Createdat\") VALUES ($1, $2, $3, $4, NOW()) RETURNING *",
            [Firstname, Lastname, Email, hashedPassword]
        );

        console.log("New user created:", newUser .rows[0]); // Logging the created user

        if (!newUser .rows[0].Userid) {
            return res.status(500).json({ error: "User  creation failed, ID not found." });
        }

        // Generate an activation token
        const token = crypto.randomBytes(20).toString('hex');

        // Store the token in ActivationToken table using the correct key
        await pool.query(
            "INSERT INTO \"ActivationToken\" (\"Userid\", \"Token\", \"Createdat\", \"Expiredat\") VALUES ($1, $2, NOW(), NOW() + interval '1 hour')",
            [newUser .rows[0].Userid, token]  // Use 'Userid' here
        );

        // Create the activation link using your production URL
        // const activationLink = `https://liwedoc.vercel.app/${token}`;
        const activationLink = `http://localhost:3000/activate/${token}`;


        // Send activation email
        await transporter.sendMail({
            to: Email,
            subject: "Account Activation",
            text: `Please activate your account by clicking the following link: ${activationLink}`
        });

        return res.status(201).json({ message: "User  created. Please check your email to activate your account." });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

// Activation route
app.get("/activate/:token", async (req, res) => {
    const token = req.params.token;

    try {
        // Check if the token is valid and not expired
        const result = await pool.query("SELECT * FROM \"ActivationToken\" WHERE \"Token\" = $1 AND \"Expiredat\" > NOW()", [token]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: "Invalid or expired token." });
        }

        // Retrieve User ID from the token record
        const userId = result.rows[0].Userid;

        // Activate the user by updating the user's record
        await pool.query("UPDATE \"user\" SET \"IsActive\" = true WHERE \"Userid\" = $1", [userId]);

        // Optionally, delete the token from ActivationToken table
        await pool.query("DELETE FROM \"ActivationToken\" WHERE \"Token\" = $1", [token]);

        return res.status(200).json({ message: "Your account has been activated. You can now log in." });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}.`);
});