const express = require('express');
const router = express.Router();
const { query } = require('./db'); // Updated import path
const { verifyToken } = require('./auth');

// Get all published items with optional filtering
router.get('/', async (req, res) => {
  try {
    const { category, query: searchQuery, limit, page = 1 } = req.query;
    const pageSize = parseInt(limit) || 10;
    const offset = (parseInt(page) - 1) * pageSize;

    let queryText = `
      SELECT p.*, u."Firstname", u."Lastname", u."Email"
      FROM posts p
      JOIN "user" u ON p.user_id = u.id
      WHERE p.type = 'item' AND p.status = 'published'
    `;

    const queryParams = [];

    if (category && category !== "all") {
      queryText += ` AND p.category = $${queryParams.length + 1}`;
      queryParams.push(category);
    }

    if (searchQuery) {
      queryText += ` AND (p.title ILIKE $${queryParams.length + 1} OR p.description ILIKE $${queryParams.length + 2})`;
      queryParams.push(`%${searchQuery}%`);
      queryParams.push(`%${searchQuery}%`);
    }

    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) FROM (${queryText}) AS count`;
    const countResult = await query(countQuery, queryParams);
    const totalItems = parseInt(countResult.rows[0].count);

    // Add pagination
    queryText += ` ORDER BY p.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(pageSize);
    queryParams.push(offset);

    const result = await query(queryText, queryParams);

    res.status(200).json({
      items: result.rows,
      pagination: {
        total: totalItems,
        page: parseInt(page),
        pageSize,
        pages: Math.ceil(totalItems / pageSize)
      }
    });
  } catch (error) {
    console.error("Error in getItems:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get a specific item by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Increment view count
    await query(
      "UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = $1",
      [id]
    );

    // Get item with user info
    const result = await query(
      `SELECT p.*, u."Firstname", u."Lastname", u."Email", u."Phone"
       FROM posts p
       JOIN "user" u ON p.user_id = u.id
       WHERE p.id = $1 AND p.type = 'item'`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error in getItemById:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new item (protected route)
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      subcategory,
      condition,
      price,
      brand,
      model,
      additional_details,
      city,
      subcity,
      location,
      trade_preferences,
      contact_info,
      status,
      images
    } = req.body;

    // Use authenticated user's ID
    const user_id = req.user.id;

    // Validate required fields
    if (!title || !category) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Parse JSON fields if they're strings
    const parsedTradePreferences = typeof trade_preferences === 'string'
      ? JSON.parse(trade_preferences)
      : trade_preferences || {};

    const parsedContactInfo = typeof contact_info === 'string'
      ? JSON.parse(contact_info)
      : contact_info || {};

    const parsedAdditionalDetails = typeof additional_details === 'string'
      ? JSON.parse(additional_details)
      : additional_details || {};

    const imageArray = typeof images === 'string'
      ? JSON.parse(images)
      : images || [];

    const result = await query(
      `INSERT INTO posts (
        user_id, type, title, description, category, subcategory, condition,
        price, brand, model, additional_details, city, subcity, location,
        images, trade_preferences, contact_info, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
      RETURNING *`,
      [
        user_id, 'item', title, description, category, subcategory, condition,
        price, brand, model, parsedAdditionalDetails, city, subcity, location,
        imageArray, parsedTradePreferences, parsedContactInfo, status || 'published'
      ]
    );

    // Create notification for new item
    await query(
      `INSERT INTO notifications (
        user_id, type, title, message, related_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        user_id,
        'item_created',
        'New Item Posted',
        `Your item "${title}" has been successfully posted.`,
        result.rows[0].id
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error in createItem:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update an existing item (protected route)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      category,
      subcategory,
      condition,
      price,
      brand,
      model,
      additional_details,
      city,
      subcity,
      location,
      trade_preferences,
      contact_info,
      status,
      keep_existing_images,
      images
    } = req.body;

    // Get the existing item to check ownership and get existing images
    const existingItem = await query(
      "SELECT * FROM posts WHERE id = $1 AND type = 'item'",
      [id]
    );

    if (existingItem.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const item = existingItem.rows[0];

    // Check if user owns this item
    if (item.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized to update this item" });
    }

    // Handle images
    let imageArray = [];
    if (images) {
      imageArray = typeof images === 'string' ? JSON.parse(images) : images;
    }

    // Combine with existing images if requested
    if (keep_existing_images === 'true' && item.images) {
      imageArray = [...item.images, ...imageArray];
    }

    // Parse JSON fields if they're strings
    const parsedTradePreferences = typeof trade_preferences === 'string'
      ? JSON.parse(trade_preferences)
      : trade_preferences;

    const parsedContactInfo = typeof contact_info === 'string'
      ? JSON.parse(contact_info)
      : contact_info;

    const parsedAdditionalDetails = typeof additional_details === 'string'
      ? JSON.parse(additional_details)
      : additional_details;

    // Build the update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }

    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }

    if (category) {
      updates.push(`category = $${paramCount++}`);
      values.push(category);
    }

    if (subcategory !== undefined) {
      updates.push(`subcategory = $${paramCount++}`);
      values.push(subcategory);
    }

    if (condition !== undefined) {
      updates.push(`condition = $${paramCount++}`);
      values.push(condition);
    }

    if (price !== undefined) {
      updates.push(`price = $${paramCount++}`);
      values.push(price);
    }

    if (brand !== undefined) {
      updates.push(`brand = $${paramCount++}`);
      values.push(brand);
    }

    if (model !== undefined) {
      updates.push(`model = $${paramCount++}`);
      values.push(model);
    }

    if (additional_details !== undefined) {
      updates.push(`additional_details = $${paramCount++}`);
      values.push(parsedAdditionalDetails);
    }

    if (city !== undefined) {
      updates.push(`city = $${paramCount++}`);
      values.push(city);
    }

    if (subcity !== undefined) {
      updates.push(`subcity = $${paramCount++}`);
      values.push(subcity);
    }

    if (location !== undefined) {
      updates.push(`location = $${paramCount++}`);
      values.push(location);
    }

    if (imageArray.length > 0 || keep_existing_images === 'false') {
      updates.push(`images = $${paramCount++}`);
      values.push(imageArray);
    }

    if (trade_preferences !== undefined) {
      updates.push(`trade_preferences = $${paramCount++}`);
      values.push(parsedTradePreferences);
    }

    if (contact_info !== undefined) {
      updates.push(`contact_info = $${paramCount++}`);
      values.push(parsedContactInfo);
    }

    if (status) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }

    updates.push(`updated_at = NOW()`);

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const queryText = `
      UPDATE posts
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND type = 'item'
      RETURNING *
    `;

    values.push(id);

    const result = await query(queryText, values);

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error in updateItem:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete an item (protected route)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the item to check if it exists and if user owns it
    const existingItem = await query(
      "SELECT * FROM posts WHERE id = $1 AND type = 'item'",
      [id]
    );

    if (existingItem.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Check if user owns this item
    if (existingItem.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized to delete this item" });
    }

    // Delete the item
    await query(
      "DELETE FROM posts WHERE id = $1",
      [id]
    );

    res.status(200).json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Error in deleteItem:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get similar items
router.get('/:id/similar', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 4 } = req.query;

    // Get the category of the current item
    const itemResult = await query(
      "SELECT category FROM posts WHERE id = $1 AND type = 'item'",
      [id]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const category = itemResult.rows[0].category;

    // Get similar items
    const similarItems = await query(
      `SELECT p.*, u."Firstname", u."Lastname"
       FROM posts p
       JOIN "user" u ON p.user_id = u.id
       WHERE p.type = 'item' AND p.status = 'published' 
       AND p.category = $1 AND p.id != $2
       ORDER BY p.created_at DESC
       LIMIT $3`,
      [category, id, parseInt(limit)]
    );

    res.status(200).json(similarItems.rows);
  } catch (error) {
    console.error("Error in getSimilarItems:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get user's items
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status = 'published' } = req.query;

    const result = await query(
      `SELECT * FROM posts 
       WHERE user_id = $1 AND type = 'item' AND status = $2
       ORDER BY created_at DESC`,
      [userId, status]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error in getUserItems:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get featured items for homepage
router.get('/featured/items', async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, u."Firstname", u."Lastname"
       FROM posts p
       JOIN "user" u ON p.user_id = u.id
       WHERE p.type = 'item' AND p.status = 'published'
       ORDER BY p.views DESC, p.created_at DESC
       LIMIT 6`,
      []
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error in getFeaturedItems:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;