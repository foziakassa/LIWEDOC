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
      condition,
      location,
      status,
      trade_type,
      accept_cash,
      brand,
      model,
      year,
      specifications
    } = req.body;

    if (!id || !user_id || !title || !category_id || !condition || !location) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    await pool.query('BEGIN');

    const itemResult = await pool.query(
      `UPDATE items SET
        title = $1,
        category_id = $2,
        description = $3,
        condition = $4,
        location = $5,
        status = $6,
        trade_type = $7,
        accept_cash = $8,
        updated_at = NOW()
      WHERE id = $9 AND user_id = $10
      RETURNING *`,
      [
        title,
        category_id,
        description || null,
        condition,
        location,
        status || 'draft',
        trade_type || null,
        accept_cash || false,
        id,
        user_id
      ]
    );

    if (itemResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found or unauthorized' });
    }

    // Upsert into item_specifications
    await pool.query(
      `INSERT INTO item_specifications (
        item_id, brand, model, year, specifications
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (item_id) DO UPDATE SET
        brand = EXCLUDED.brand,
        model = EXCLUDED.model,
        year = EXCLUDED.year,
        specifications = EXCLUDED.specifications,
        updated_at = NOW()`,
      [
        id,
        brand || null,
        model || null,
        year || null,
        specifications ? JSON.stringify(specifications) : null
      ]
    );

    await pool.query('COMMIT');
    return res.status(200).json(itemResult.rows[0]);
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
