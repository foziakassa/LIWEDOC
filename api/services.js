import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // CREATE SERVICE
    if (req.method === 'POST') {
      const {
        user_id,
        title,
        category_id,
        description,
        hourly_rate,
        location,
        time_estimation,
        time_unit,
        cancellation_policy
      } = req.body;

      const result = await pool.query(
        `INSERT INTO services (
          user_id, title, category_id, description,
          hourly_rate, location, status,
          time_estimation, time_unit, cancellation_policy
        ) VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9)
        RETURNING *`,
        [
          user_id, title, category_id, description,
          hourly_rate, location,
          time_estimation, time_unit, cancellation_policy
        ]
      );

      return res.status(201).json(result.rows[0]);
    }

    // GET ALL SERVICES
    if (req.method === 'GET') {
      const { category_id, user_id } = req.query;
      let query = `SELECT * FROM services WHERE status = 'published'`;
      const params = [];

      if (category_id) {
        query += ' AND category_id = $1';
        params.push(category_id);
      }
      if (user_id) {
        query += (params.length ? ' AND' : ' WHERE') + ' user_id = $' + (params.length + 1);
        params.push(user_id);
      }

      const result = await pool.query(query, params);
      return res.status(200).json(result.rows);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}