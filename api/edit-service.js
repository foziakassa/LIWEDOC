import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      id,
      user_id,
      title,
      category_id,
      description,
      hourly_rate,
      location,
      status,
      time_estimation,
      time_unit,
      cancellation_policy
    } = req.body;

    if (!id || !user_id) {
      return res.status(400).json({ error: 'Service ID and user ID are required' });
    }

    const result = await pool.query(
      `UPDATE services SET
        title = $1,
        category_id = $2,
        description = $3,
        hourly_rate = $4,
        location = $5,
        status = $6,
        time_estimation = $7,
        time_unit = $8,
        cancellation_policy = $9,
        updated_at = NOW()
      WHERE id = $10 AND user_id = $11
      RETURNING *`,
      [
        title, category_id, description,
        hourly_rate, location, status || 'draft',
        time_estimation, time_unit, cancellation_policy,
        id, user_id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found or unauthorized' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}