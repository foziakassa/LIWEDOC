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
      // Parse and validate request body
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      const {
        user_id,
        title,
        category_id,
        description,
        condition,
        location,
        trade_type,
        accept_cash,
        brand,
        model,
        year,
        specifications,
        images = [],
      } = body;

      // Validate required fields with better error messages
      const missingFields = [];
      if (!user_id) missingFields.push('user_id');
      if (!title) missingFields.push('title');
      if (!category_id) missingFields.push('category_id');
      if (!condition) missingFields.push('condition');
      if (!location) missingFields.push('location');

      if (missingFields.length > 0) {
        return res.status(400).json({
          error: 'Missing required fields',
          missingFields,
          message: `Please provide: ${missingFields.join(', ')}`
        });
      }

      await pool.query('BEGIN');

      // Insert item
      const itemResult = await pool.query(
        `INSERT INTO items (
          user_id, title, category_id, description, condition,
          location, trade_type, accept_cash, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'published')
        RETURNING *`,
        [
          user_id,
          title,
          category_id,
          description || null,
          condition,
          location,
          trade_type || null,
          accept_cash || false,
        ]
      );

      const itemId = itemResult.rows[0].id;

      // Insert specifications if provided
      if (brand || model || year || specifications) {
        await pool.query(
          `INSERT INTO item_specifications (
            item_id, brand, model, year, specifications
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            itemId,
            brand || null,
            model || null,
            year || null,
            specifications ? JSON.stringify(specifications) : null,
          ]
        );
      }

      // Insert images if provided
      if (Array.isArray(images)) {
        for (const [index, img] of images.entries()) {
          await pool.query(
            `INSERT INTO images (
              entity_type, entity_id, url, is_main, uploaded_by
            ) VALUES ('item', $1, $2, $3, $4)`,
            [itemId, img.url, index === 0, user_id] // First image is main by default
          );
        }
      }

      await pool.query('COMMIT');
      return res.status(201).json({
        success: true,
        item: itemResult.rows[0],
        message: 'Item created successfully'
      });
    }

    if (req.method === 'GET') {
      // Handle query parameters
      const { category_id, user_id, limit = 20, offset = 0 } = req.query;

      let query = `
        SELECT 
          i.*, 
          c.name AS category_name,
          json_agg(
            json_build_object(
              'id', img.id,
              'url', img.url,
              'is_main', img.is_main
            )
          ) AS images
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        LEFT JOIN images img ON img.entity_id = i.id AND img.entity_type = 'item'
        WHERE i.status = 'published'
      `;

      const queryParams = [];
      let paramCount = 1;

      if (category_id) {
        query += ` AND i.category_id = $${paramCount++}`;
        queryParams.push(category_id);
      }

      if (user_id) {
        query += ` AND i.user_id = $${paramCount++}`;
        queryParams.push(user_id);
      }

      query += `
        GROUP BY i.id, c.name
        ORDER BY i.created_at DESC
        LIMIT $${paramCount++} OFFSET $${paramCount++}
      `;
      queryParams.push(parseInt(limit), parseInt(offset));

      const result = await pool.query(query, queryParams);

      return res.status(200).json({
        success: true,
        count: result.rowCount,
        items: result.rows,
      });
    }

    return res.status(405).json({
      error: 'Method Not Allowed',
      allowedMethods: ['GET', 'POST', 'OPTIONS']
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('API Error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}