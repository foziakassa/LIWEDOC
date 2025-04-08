import pool from './db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const { Email, Password } = req.body;

    if (!Email || !Password) {
      return res.status(400).json({ error: "Email and Password are required." });
    }

    try {
      const userCheck = await pool.query(
        'SELECT * FROM "user" WHERE "Email" = $1',
        [Email]
      );

      if (userCheck.rows.length === 0) {
        return res.status(401).json({ error: "Invalid email or password." });
      }

      const user = userCheck.rows[0];
      const isPasswordValid = await bcrypt.compare(Password, user.Password);

      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid email or password." });
      }

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.Email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const { Password: _, ...userData } = user;
      return res.status(200).json({ ...userData, token });

    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}