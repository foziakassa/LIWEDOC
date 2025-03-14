// api/users.js
import pool from './db';

export default async function handler(req, res) {
    app.post("/login", async (req, res) => {
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
    
            // If login is successful, you can return user data or a token
            // For simplicity, we'll return the user data (excluding the password)
            const { Password: _, ...userData } = user; // Exclude password from response
            return res.status(200).json(userData);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    });
}
// POST route to login a user
