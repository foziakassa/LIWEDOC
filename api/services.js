const express = require('express');
const router = express.Router();
const { query } = require('./db'); // Updated import path
const { verifyToken } = require('./auth');

// Get all published services with optional filtering
router.get('/', async (req, res) => {
  try {
    const { category, query: searchQuery, limit, page = 1 } = req.query;
    const pageSize = parseInt(limit) || 10;
    const offset = (parseInt(page) - 1) * pageSize;

    let queryText = `
      SELECT p.*, u."Firstname", u."Lastname", u."Email"
      FROM posts p
      JOIN "user" u ON p.user_id = u.id
      WHERE p.type = 'service' AND p.status = 'published'
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
      services: result.rows,
      pagination: {
        total: totalItems,
        page: parseInt(page),
        pageSize,
        pages: Math.ceil(totalItems / pageSize)
      }
    });
  } catch (error) {
    console.error("Error in getServices:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get a specific service by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Increment view count
    await query(
      "UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = $1",
      [id]
    );

    // Get service with user info
    const result = await query(
      `SELECT p.*, u."Firstname", u."Lastname", u."Email", u."Phone"
       FROM posts p
       JOIN "user" u ON p.user_id = u.id
       WHERE p.id = $1 AND p.type = 'service'`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error in getServiceById:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new service (protected route)
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      subcategory,
      city,
      subcity,
      location,
      service_details,
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
    const parsedServiceDetails = typeof service_details === 'string'
      ? JSON.parse(service_details)
      : service_details || {};

    const parsedTradePreferences = typeof trade_preferences === 'string'
      ? JSON.parse(trade_preferences)
      : trade_preferences || {};

    const parsedContactInfo = typeof contact_info === 'string'
      ? JSON.parse(contact_info)
      : contact_info || {};

    const imageArray = typeof images === 'string'
      ? JSON.parse(images)
      : images || [];

    const result = await query(
      `INSERT INTO posts (
        user_id, type, title, description, category, subcategory,
        city, subcity, location, images, service_details,
        trade_preferences, contact_info, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      RETURNING *`,
      [
        user_id, 'service', title, description, category, subcategory,
        city, subcity, location, imageArray, parsedServiceDetails,
        parsedTradePreferences, parsedContactInfo, status || 'published'
      ]
    );

    // Create notification for new service
    await query(
      `INSERT INTO notifications (
        user_id, type, title, message, related_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        user_id,
        'service_created',
        'New Service Posted',
        `Your service "${title}" has been successfully posted.`,
        result.rows[0].id
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error in createService:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update an existing service (protected route)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      category,
      subcategory,
      city,
      subcity,
      location,
      service_details,
      trade_preferences,
      contact_info,
      status,
      keep_existing_images,
      images
    } = req.body;

    // Get the existing service to check ownership and get existing images
    const existingService = await query(
      "SELECT * FROM posts WHERE id = $1 AND type = 'service'",
      [id]
    );

    if (existingService.rows.length === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    const service = existingService.rows[0];

    // Check if user owns this service
    if (service.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized to update this service" });
    }

    // Handle images
    let imageArray = [];
    if (images) {
      imageArray = typeof images === 'string' ? JSON.parse(images) : images;
    }

    // Combine with existing images if requested
    if (keep_existing_images === 'true' && service.images) {
      imageArray = [...service.images, ...imageArray];
    }

    // Parse JSON fields if they're strings
    const parsedServiceDetails = typeof service_details === 'string'
      ? JSON.parse(service_details)
      : service_details;

    const parsedTradePreferences = typeof trade_preferences === 'string'
      ? JSON.parse(trade_preferences)
      : trade_preferences;

    const parsedContactInfo = typeof contact_info === 'string'
      ? JSON.parse(contact_info)
      : contact_info;

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

    if (service_details !== undefined) {
      updates.push(`service_details = $${paramCount++}`);
      values.push(parsedServiceDetails);
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
      WHERE id = $${paramCount} AND type = 'service'
      RETURNING *
    `;

    values.push(id);

    const result = await query(queryText, values);

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error in updateService:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a service (protected route)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the service to check if it exists and if user owns it
    const existingService = await query(
      "SELECT * FROM posts WHERE id = $1 AND type = 'service'",
      [id]
    );

    if (existingService.rows.length === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    // Check if user owns this service
    if (existingService.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized to delete this service" });
    }

    // Delete the service
    await query(
      "DELETE FROM posts WHERE id = $1",
      [id]
    );

    res.status(200).json({ message: "Service deleted successfully" });
  } catch (error) {
    console.error("Error in deleteService:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get similar services
router.get('/:id/similar', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 4 } = req.query;

    // Get the category of the current service
    const serviceResult = await query(
      "SELECT category FROM posts WHERE id = $1 AND type = 'service'",
      [id]
    );

    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    const category = serviceResult.rows[0].category;

    // Get similar services
    const similarServices = await query(
      `SELECT p.*, u."Firstname", u."Lastname"
       FROM posts p
       JOIN "user" u ON p.user_id = u.id
       WHERE p.type = 'service' AND p.status = 'published' 
       AND p.category = $1 AND p.id != $2
       ORDER BY p.created_at DESC
       LIMIT $3`,
      [category, id, parseInt(limit)]
    );

    res.status(200).json(similarServices.rows);
  } catch (error) {
    console.error("Error in getSimilarServices:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get user's services
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status = 'published' } = req.query;

    const result = await query(
      `SELECT * FROM posts 
       WHERE user_id = $1 AND type = 'service' AND status = $2
       ORDER BY created_at DESC`,
      [userId, status]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error in getUserServices:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get featured services for homepage
router.get('/featured/services', async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, u."Firstname", u."Lastname"
       FROM posts p
       JOIN "user" u ON p.user_id = u.id
       WHERE p.type = 'service' AND p.status = 'published'
       ORDER BY p.views DESC, p.created_at DESC
       LIMIT 6`,
      []
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error in getFeaturedServices:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;