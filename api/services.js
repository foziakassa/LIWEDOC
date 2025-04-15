import pool from './db';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      // [Previous POST implementation remains the same]
      // ... (no changes needed here as it doesn't reference users table)
    }

    if (req.method === 'GET') {
      // Handle query parameters
      const {
        category_id,
        user_id,
        min_rate,
        max_rate,
        limit = 20,
        offset = 0
      } = req.query;

      let query = `
        SELECT 
          s.*, 
          c.name AS category_name,
          json_agg(
            json_build_object(
              'id', img.id,
              'url', img.url,
              'is_main', img.is_main
            )
          ) AS images,
          u.name AS provider_name,
          u.profile_image AS provider_image
        FROM services s
        LEFT JOIN categories c ON s.category_id = c.id
        LEFT JOIN images img ON img.entity_id = s.id AND img.entity_type = 'service'
        LEFT JOIN "user" u ON s.user_id = u.id  <!-- Changed from users to "user" -->
        WHERE s.status = 'published'
      `;

      const queryParams = [];
      let paramCount = 1;

      if (category_id) {
        query += ` AND s.category_id = $${paramCount++}`;
        queryParams.push(category_id);
      }

      if (user_id) {
        query += ` AND s.user_id = $${paramCount++}`;
        queryParams.push(user_id);
      }

      if (min_rate) {
        query += ` AND s.hourly_rate >= $${paramCount++}`;
        queryParams.push(parseFloat(min_rate));
      }

      if (max_rate) {
        query += ` AND s.hourly_rate <= $${paramCount++}`;
        queryParams.push(parseFloat(max_rate));
      }

      query += `
        GROUP BY s.id, c.name, u.name, u.profile_image
        ORDER BY s.created_at DESC
        LIMIT $${paramCount++} OFFSET $${paramCount++}
      `;
      queryParams.push(parseInt(limit), parseInt(offset));

      const result = await pool.query(query, queryParams);

      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) 
        FROM services 
        WHERE status = 'published'
        ${category_id ? 'AND category_id = $1' : ''}
        ${user_id ? (category_id ? 'AND user_id = $2' : 'AND user_id = $1') : ''}
      `;
      const countParams = category_id ?
        (user_id ? [category_id, user_id] : [category_id]) :
        (user_id ? [user_id] : []);

      const countResult = await pool.query(countQuery, countParams);
      const totalCount = parseInt(countResult.rows[0].count);

      return res.status(200).json({
        success: true,
        count: result.rowCount,
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        services: result.rows,
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed',
      allowedMethods: ['GET', 'POST', 'OPTIONS']
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Service API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}