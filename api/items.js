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
        condition,
        location,
        trade_type,
        accept_cash,
        brand,
        model,
        year,
        specifications,
        images,
      } = req.body;

      // Required validation
      if (!user_id || !title || !category_id || !condition || !location) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }

      await pool.query('BEGIN');

      // Insert item
      const itemResult = await pool.query(
        `INSERT INTO items (
          user_id, title, category_id, description, condition,
          location, trade_type, accept_cash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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

      // Insert specifications
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

      // Insert images
      if (Array.isArray(images)) {
        for (const img of images) {
          await pool.query(
            `INSERT INTO images (
              entity_type, entity_id, url, is_main, uploaded_by
            ) VALUES ('item', $1, $2, $3, $4)`,
            [itemId, img.url, img.is_main || false, user_id]
          );
        }
      }

      await pool.query('COMMIT');
      return res.status(201).json(itemResult.rows[0]);
    }

    if (req.method === 'GET') {
      const result = await pool.query(`
        SELECT i.*, c.name AS category_name
        FROM items i
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE i.status = 'published'
        ORDER BY i.created_at DESC
      `);
      return res.status(200).json(result.rows);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Item API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
