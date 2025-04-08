import pool from './db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const { action, username, email, password } = req.body;

    try {
      if (action === 'register') {
        // Registration logic
        const userCheck = await pool.query(
          'SELECT * FROM users WHERE email = $1 OR username = $2',
          [email, username]
        );
        
        if (userCheck.rows.length > 0) {
          return res.status(409).json({ error: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
          'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
          [username, email, hashedPassword]
        );

        const token = jwt.sign(
          { id: newUser.rows[0].id, username: newUser.rows[0].username },
          process.env.JWT_SECRET || 'J.110W166666666868',
          { expiresIn: '7d' }
        );

        return res.status(201).json({ token, user: newUser.rows[0] });
      } else if (action === 'login') {
        // Login logic
        const user = await pool.query(
          'SELECT * FROM users WHERE email = $1',
          [email]
        );
        
        if (user.rows.length === 0) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);
        if (!validPassword) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
          { id: user.rows[0].id, username: user.rows[0].username },
          process.env.JWT_SECRET || 'J.110W166666666868',
          { expiresIn: '7d' }
        );

        return res.json({ 
          token, 
          user: { 
            id: user.rows[0].id, 
            username: user.rows[0].username, 
            email: user.rows[0].email 
          } 
        });
      } else {
        return res.status(400).json({ error: 'Invalid action' });
      }
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}