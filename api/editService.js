import pool from './db';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
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
      trade_type,
      time_estimation,
      time_unit,
      cancellation_policy
    } = req.body;

    if (!id || !user_id || !title || !category_id || !location) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const result = await pool.query(
      `UPDATE services SET
        title = $1,
        category_id = $2,
        description = $3,
        hourly_rate = $4,
        location = $5,
        status = $6,
        trade_type = $7,
        time_estimation = $8,
        time_unit = $9,
        cancellation_policy = $10,
        updated_at = NOW()
      WHERE id = $11 AND user_id = $12
      RETURNING *`,
      [
        title,
        category_id,
        description || null,
        hourly_rate || null,
        location,
        status || 'draft',
        trade_type || null,
        time_estimation || null,
        time_unit || null,
        cancellation_policy || null,
        id,
        user_id
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
