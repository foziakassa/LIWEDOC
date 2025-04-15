import pool from './db';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const {
        user_id,
        title,
        category_id,
        description,
        hourly_rate,
        location,
        trade_type,
        time_estimation,
        time_unit,
        cancellation_policy,
        images,
      } = req.body;

      if (!user_id || !title || !category_id || !location) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }

      const serviceResult = await pool.query(
        `INSERT INTO services (
          user_id, title, category_id, description, hourly_rate,
          location, trade_type, time_estimation, time_unit, cancellation_policy
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          user_id,
          title,
          category_id,
          description || null,
          hourly_rate || null,
          location,
          trade_type || null,
          time_estimation || null,
          time_unit || null,
          cancellation_policy || null,
        ]
      );

      const serviceId = serviceResult.rows[0].id;

      // Insert images
      if (Array.isArray(images)) {
        for (const img of images) {
          await pool.query(
            `INSERT INTO images (
              entity_type, entity_id, url, is_main, uploaded_by
            ) VALUES ('service', $1, $2, $3, $4)`,
            [serviceId, img.url, img.is_main || false, user_id]
          );
        }
      }

      return res.status(201).json(serviceResult.rows[0]);
    }

    if (req.method === 'GET') {
      const result = await pool.query(`
        SELECT s.*, c.name AS category_name
        FROM services s
        LEFT JOIN categories c ON s.category_id = c.id
        WHERE s.status = 'published'
        ORDER BY s.created_at DESC
      `);
      return res.status(200).json(result.rows);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Service API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
