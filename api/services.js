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
      // Parse and validate request body
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

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
      } = body;

      // Validate required fields with detailed error messages
      const missingFields = [];
      if (!user_id) missingFields.push('user_id');
      if (!title) missingFields.push('title');
      if (!category_id) missingFields.push('category_id');
      if (!location) missingFields.push('location');

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          missingFields,
          message: `Please provide: ${missingFields.join(', ')}`
        });
      }

      // Validate time_unit if provided
      const validTimeUnits = ['hours', 'days', 'weeks', 'months'];
      if (time_unit && !validTimeUnits.includes(time_unit)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid time_unit',
          message: `time_unit must be one of: ${validTimeUnits.join(', ')}`
        });
      }

      // Validate cancellation_policy if provided
      const validPolicies = ['flexible', 'moderate', 'strict', 'nonRefundable'];
      if (cancellation_policy && !validPolicies.includes(cancellation_policy)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid cancellation_policy',
          message: `cancellation_policy must be one of: ${validPolicies.join(', ')}`
        });
      }

      // Validate trade_type if provided
      const validTradeTypes = ['serviceForItem', 'serviceForService', 'openToAll'];
      if (trade_type && !validTradeTypes.includes(trade_type)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid trade_type',
          message: `trade_type must be one of: ${validTradeTypes.join(', ')}`
        });
      }

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
      if (Array.isArray(images) && images.length > 0) {
        for (const [index, img] of images.entries()) {
          if (!img.url) continue;

          await pool.query(
            `INSERT INTO images (
              entity_type, entity_id, url, is_main, uploaded_by
            ) VALUES ('service', $1, $2, $3, $4)`,
            [serviceId, img.url, index === 0, user_id] // First image is main by default
          );
        }
      }

      await pool.query('COMMIT');

      // Fetch the complete service with images and category
      const completeService = await pool.query(`
        SELECT s.*, c.name AS category_name,
          (SELECT json_agg(json_build_object(
            'id', i.id,
            'url', i.url,
            'is_main', i.is_main
          )) AS images
        FROM services s
        LEFT JOIN categories c ON s.category_id = c.id
        LEFT JOIN images i ON i.entity_id = s.id AND i.entity_type = 'service'
        WHERE s.id = $1
        GROUP BY s.id, c.name
      `, [serviceId]);

      return res.status(201).json({
        success: true,
        service: completeService.rows[0],
        message: 'Service created successfully'
      });
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
        LEFT JOIN users u ON s.user_id = u.id
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