import pool from './db';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // JWT Authentication
  const token = req.headers.authorization?.split(' ')[1];
  if (!token && req.method !== 'GET') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    if (req.method === 'POST') {
      // Verify JWT for write operations
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;

      const {
        title,
        category_id,
        description,
        condition,
        location
      } = req.body;

      const result = await pool.query(
        `INSERT INTO items (
          user_id, title, category_id, description, 
          condition, location, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'draft')
        RETURNING *`,
        [userId, title, category_id, description, condition, location]
      );

      return res.status(201).json(result.rows[0]);

    } else if (req.method === 'GET') {
      // Public access for listing
      const { category_id } = req.query;
      let query = 'SELECT * FROM items WHERE status = $1';
      const params = ['published'];

      if (category_id) {
        query += ' AND category_id = $2';
        params.push(category_id);
      }

      const result = await pool.query(query, params);
      return res.json(result.rows);

    } else if (req.method === 'PUT') {
      // Verify JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;

      const { id, ...updates } = req.body;
      const setClause = Object.keys(updates)
        .map((key, i) => `"${key}" = $${i + 1}`)
        .join(', ');

      const values = [...Object.values(updates), id, userId];

      const result = await pool.query(
        `UPDATE items SET ${setClause} 
         WHERE id = $${values.length - 1} AND user_id = $${values.length}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Item not found or unauthorized' });
      }

      return res.json(result.rows[0]);
    }

    return res.status(405).end(`Method ${req.method} Not Allowed`);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}