import pool from './db';

export default async function handler(req, res) {
  // Enhanced CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // Add logging for debugging
  console.log(`Incoming ${req.method} request to /api/services`);
  console.log('Headers:', req.headers);
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log('Request body:', req.body);
  }

  // Handle OPTIONS requests first
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight');
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      // Ensure body is parsed correctly
      let requestBody = req.body;
      if (typeof req.body === 'string') {
        try {
          requestBody = JSON.parse(req.body);
        } catch (e) {
          console.error('Error parsing JSON:', e);
          return res.status(400).json({
            success: false,
            error: 'Invalid JSON format'
          });
        }
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

      console.log('Parsed request body:', {
        user_id, title, category_id, description, hourly_rate, location,
        trade_type, time_estimation, time_unit, cancellation_policy, images
      });

      // Validate required fields
      const missingFields = [];
      if (!user_id) missingFields.push('user_id');
      if (!title) missingFields.push('title');
      if (!category_id) missingFields.push('category_id');
      if (!location) missingFields.push('location');

      if (missingFields.length > 0) {
        console.log('Missing required fields:', missingFields);
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          missingFields,
          message: `Please provide: ${missingFields.join(', ')}`
        });
      }

      // Start transaction
      await pool.query('BEGIN');
      console.log('Transaction started');

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
      console.log('Service created with ID:', serviceId);

      // Insert images if provided
      if (Array.isArray(images) && images.length > 0) {
        console.log('Processing images...');
        for (const [index, img] of images.entries()) {
          if (!img.url) {
            console.warn('Skipping image with missing URL');
            continue;
          }

          await pool.query(
            `INSERT INTO images (
              entity_type, entity_id, url, is_main, uploaded_by
            ) VALUES ('service', $1, $2, $3, $4)`,
            [serviceId, img.url, index === 0, user_id]
          );
          console.log(`Image ${index} inserted for service ${serviceId}`);
        }
      }

      await pool.query('COMMIT');
      console.log('Transaction committed');

      // Fetch complete service data
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

      console.log('Service creation complete');
      return res.status(201).json({
        success: true,
        service: completeService.rows[0],
        message: 'Service created successfully'
      });
    }

    if (req.method === 'GET') {
      // [Previous GET implementation remains the same]
      // ...
    }

    console.warn(`Method ${req.method} not allowed`);
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed',
      allowedMethods: ['GET', 'POST', 'OPTIONS'],
      receivedMethod: req.method  // Added to help debugging
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Service API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      requestInfo: {  // Added debugging info
        method: req.method,
        headers: req.headers,
        body: req.body
      }
    });
  }
}