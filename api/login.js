// api/users.js
import pool from './db'; // Ensure this is the correct path to your db module
import bcrypt from 'bcrypt';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        // Handle preflight request
        return res.status(200).end();
    }

    if (req.method === 'POST') {
        const { Email, Password } = req.body;

        if (!Email || !Password) {
            return res.status(400).json({ error: "Email and Password are required." });
        }

        try {
            // Check for existing user with the provided email
            const userCheck = await pool.query("SELECT * FROM \"users\" WHERE \"Email\" = $1", [Email]);
            if (userCheck.rows.length === 0) {
                return res.status(401).json({ error: "Invalid email or password." });
            }

            const user = userCheck.rows[0];

            // Compare the provided password with the hashed password
            const isPasswordValid = await bcrypt.compare(Password, user.Password);
            if (!isPasswordValid) {
                return res.status(401).json({ error: "Invalid email or password." });
            }

            // If login is successful, return user data (excluding the password)
            const { Password: _, ...userData } = user; // Exclude password from response
            return res.status(200).json(userData);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    } else {
        // Handle any other HTTP method
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}



