// const express = require('express');
// const router = express.Router();
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const { query } = require('./db'); // Updated import path

// const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// // Register a new user
// router.post('/register', async (req, res) => {
//   try {
//     const { Firstname, Lastname, Email, Password, Phone, Location } = req.body;

//     // Validate required fields
//     if (!Firstname || !Lastname || !Email || !Password) {
//       return res.status(400).json({ error: "All fields are required." });
//     }

//     // Check if user already exists
//     const userCheck = await query("SELECT * FROM \"user\" WHERE \"Email\" = $1", [Email]);
//     if (userCheck.rows.length > 0) {
//       return res.status(400).json({ error: "User already exists." });
//     }

//     // Hash password
//     const salt = await bcrypt.genSalt(10);
//     const hashedPassword = await bcrypt.hash(Password, salt);

//     // Create new user
//     const newUser = await query(
//       "INSERT INTO \"user\" (\"Firstname\", \"Lastname\", \"Email\", \"Password\", \"Phone\", \"Location\", \"Role\", \"activated\", \"Createdat\", \"Updatedat\") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING *",
//       [Firstname, Lastname, Email, hashedPassword, Phone || null, Location || null, "User", true]
//     );

//     // Generate JWT token
//     const token = jwt.sign(
//       { id: newUser.rows[0].id, email: newUser.rows[0].Email },
//       JWT_SECRET,
//       { expiresIn: '7d' }
//     );

//     // Return user data without password
//     const { Password: _, ...userData } = newUser.rows[0];
//     return res.status(201).json({ token, user: userData });
//   } catch (err) {
//     console.error(err);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // Login user
// router.post('/login', async (req, res) => {
//   try {
//     const { Email, Password } = req.body;

//     // Validate required fields
//     if (!Email || !Password) {
//       return res.status(400).json({ error: "Email and Password are required." });
//     }

//     // Check if user exists
//     const userCheck = await query("SELECT * FROM \"user\" WHERE \"Email\" = $1", [Email]);
//     if (userCheck.rows.length === 0) {
//       return res.status(401).json({ error: "Invalid email or password." });
//     }

//     const user = userCheck.rows[0];

//     // Compare passwords
//     const isPasswordValid = await bcrypt.compare(Password, user.Password);
//     if (!isPasswordValid) {
//       return res.status(401).json({ error: "Invalid email or password." });
//     }

//     // Update last login time
//     await query(
//       "UPDATE \"user\" SET \"last_login\" = NOW() WHERE \"id\" = $1",
//       [user.id]
//     );

//     // Generate JWT token
//     const token = jwt.sign(
//       { id: user.id, email: user.Email },
//       JWT_SECRET,
//       { expiresIn: '7d' }
//     );

//     // Return user data without password
//     const { Password: _, ...userData } = user;
//     return res.status(200).json({ token, user: userData });
//   } catch (err) {
//     console.error(err);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // Middleware to verify JWT token
// const verifyToken = (req, res, next) => {
//   const authHeader = req.headers.authorization;

//   if (!authHeader) {
//     return res.status(401).json({ error: "No token provided" });
//   }

//   const token = authHeader.split(' ')[1]; // Bearer TOKEN

//   if (!token) {
//     return res.status(401).json({ error: "No token provided" });
//   }

//   try {
//     const decoded = jwt.verify(token, JWT_SECRET);
//     req.user = decoded;
//     next();
//   } catch (err) {
//     return res.status(401).json({ error: "Invalid token" });
//   }
// };

// // Get current user
// router.get('/me', verifyToken, async (req, res) => {
//   try {
//     const user = await query(
//       "SELECT * FROM \"user\" WHERE \"id\" = $1",
//       [req.user.id]
//     );

//     if (user.rows.length === 0) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     // Return user data without password
//     const { Password: _, ...userData } = user.rows[0];
//     return res.status(200).json(userData);
//   } catch (err) {
//     console.error(err);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// module.exports = {
//   router,
//   verifyToken
// };