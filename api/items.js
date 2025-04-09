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
    // CREATE ITEM
    if (req.method === 'POST') {
      const {
        user_id,
        title,
        category_id,
        description,
        condition,
        location,
        brand,
        model,
        year,
        specifications
      } = req.body;

      await pool.query('BEGIN');

      // Insert main item
      const itemResult = await pool.query(
        `INSERT INTO items (
          user_id, title, category_id, description, 
          condition, location, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'draft')
        RETURNING *`,
        [user_id, title, category_id, description, condition, location]
      );

      // Insert specifications
      await pool.query(
        `INSERT INTO item_specifications (
          item_id, brand, model, year, specifications
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          itemResult.rows[0].id,
          brand,
          model,
          year,
          JSON.stringify(specifications || {})
        ]
      );

      await pool.query('COMMIT');
      return res.status(201).json(itemResult.rows[0]);
    }

    // GET ALL ITEMS
    if (req.method === 'GET') {
      const { category_id, user_id } = req.query;
      let query = `SELECT items.*, 
                  item_specifications.brand,
                  item_specifications.model,
                  item_specifications.year,
                  item_specifications.specifications
                  FROM items
                  LEFT JOIN item_specifications ON items.id = item_specifications.item_id
                  WHERE status = 'published'`;
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
    await pool.query('ROLLBACK');
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}