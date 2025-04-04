// api/adminregistration.js
import { Pool } from "pg";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

// PostgreSQL connection setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

// Handler function for admin registration
export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { Firstname, Lastname, Email, Password , Role } = req.body;

        if (!Firstname || !Lastname || !Email || !Password || !Role) {
            return res.status(400).json({ error: "All fields are required." });
        }

        try {
            // Check for existing user with the provided email
            const userCheck = await pool.query("SELECT * FROM \"admin\" WHERE \"Email\" = $1", [Email]);
            if (userCheck.rows.length > 0) {
                return res.status(400).json({ error: "User  already exists." });
            }

            const hashedPassword = await bcrypt.hash(Password, 10);
            const newUser  = await pool.query(
                "INSERT INTO \"admin\" (\"Firstname\", \"Lastname\", \"Email\", \"Password\" , \"Role\") VALUES ($1, $2, $3, $4 , $5) RETURNING *",
                [Firstname, Lastname, Email, hashedPassword , Role]
            );

            return res.status(201).json(newUser .rows[0]);
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