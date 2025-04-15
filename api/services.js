import pool from './db';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      // Parse the request body
      let requestBody;
      try {
        requestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON format'
        });
      }

      const {
        user_id,
        title,
        category_id,
        description,
        hourly_rate,
        location,
        trade_type = 'serviceForService',
        time_estimation,
        time_unit = 'hours',
        cancellation_policy = 'flexible',
        images = [],
      } = requestBody;

      // Validate required fields
      if (!user_id || !title || !category_id || !location) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          requiredFields: ['user_id', 'title', 'category_id', 'location'],
          receivedData: requestBody
        });
      }

      // Start transaction
      await pool.query('BEGIN');

      // Insert service
      const serviceResult = await pool.query(
        `INSERT INTO services (
          user_id, title, category_id, description, hourly_rate,
          location, trade_type, time_estimation, time_unit, 
          cancellation_policy, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'published')
        RETURNING *`,
        [
          user_id,
          title,
          category_id,
          description || null,
          hourly_rate ? parseFloat(hourly_rate) : null,
          location,
          trade_type,
          time_estimation ? parseInt(time_estimation) : null,
          time_unit,
          cancellation_policy,
        ]
      );

      const serviceId = serviceResult.rows[0].id;

      // Insert images if provided
      if (Array.isArray(images)) {
        for (const [index, img] of images.entries()) {
          if (img.url) { // Only insert if URL exists
            await pool.query(
              `INSERT INTO images (
                entity_type, entity_id, url, is_main, uploaded_by
              ) VALUES ('service', $1, $2, $3, $4)`,
              [serviceId, img.url, index === 0, user_id] // First image is main
            );
          }
        }
      }

      await pool.query('COMMIT');

      return res.status(201).json({
        success: true,
        service: serviceResult.rows[0],
        message: 'Service created successfully'
      });
    }

    if (req.method === 'GET') {
      const { category_id, user_id, limit = 20, offset = 0 } = req.query;

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
          ) AS images
        FROM services s
        LEFT JOIN categories c ON s.category_id = c.id
        LEFT JOIN images img ON img.entity_id = s.id AND img.entity_type = 'service'
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

      query += `
        GROUP BY s.id, c.name
        ORDER BY s.created_at DESC
        LIMIT $${paramCount++} OFFSET $${paramCount++}
      `;
      queryParams.push(parseInt(limit), parseInt(offset));

      const result = await pool.query(query, queryParams);

      return res.status(200).json({
        success: true,
        count: result.rowCount,
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
      message: error.message
    });
  }
}