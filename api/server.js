const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

// Import database connection
const { pool } = require('./api/db');

// Import route modules
const itemsRouter = require('./api/items');
const servicesRouter = require('./api/services');
const swapRequestsRouter = require('./api/swap-requests');
const { router: notificationsRouter } = require('./api/notifications');
const messagesRouter = require('./api/messages');
const searchRouter = require('./api/search');
const analyticsRouter = require('./api/analytics');
const { router: authRouter, verifyToken } = require('./api/auth');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// API routes
app.use('/api/items', itemsRouter);
app.use('/api/services', servicesRouter);
app.use('/api/swap-requests', swapRequestsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/search', searchRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/auth', authRouter);

// Homepage data endpoint
app.get('/api/homepage', async (req, res) => {
  try {
    // Get featured items
    const featuredItems = await pool.query(
      `SELECT p.*, u."Firstname", u."Lastname"
       FROM posts p
       JOIN "user" u ON p.user_id = u.id
       WHERE p.type = 'item' AND p.status = 'published'
       ORDER BY p.views DESC, p.created_at DESC
       LIMIT 6`
    );

    // Get featured services
    const featuredServices = await pool.query(
      `SELECT p.*, u."Firstname", u."Lastname"
       FROM posts p
       JOIN "user" u ON p.user_id = u.id
       WHERE p.type = 'service' AND p.status = 'published'
       ORDER BY p.views DESC, p.created_at DESC
       LIMIT 6`
    );

    // Get recent posts (both items and services)
    const recentPosts = await pool.query(
      `SELECT p.*, u."Firstname", u."Lastname"
       FROM posts p
       JOIN "user" u ON p.user_id = u.id
       WHERE p.status = 'published'
       ORDER BY p.created_at DESC
       LIMIT 8`
    );

    // Get categories with counts
    const categories = await pool.query(
      `SELECT category, COUNT(*) as count
       FROM posts
       WHERE status = 'published'
       GROUP BY category
       ORDER BY count DESC
       LIMIT 10`
    );

    res.status(200).json({
      featuredItems: featuredItems.rows,
      featuredServices: featuredServices.rows,
      recentPosts: recentPosts.rows,
      categories: categories.rows
    });
  } catch (error) {
    console.error("Error fetching homepage data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// User profile endpoint
app.get('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await pool.query(
      "SELECT id, \"Firstname\", \"Lastname\", \"Email\", \"Phone\", \"Location\", \"Bio\", \"Image\" FROM \"user\" WHERE \"id\" = $1 AND \"Deletedat\" IS NULL",
      [userId]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    // Get user's posts count
    const postsCount = await pool.query(
      "SELECT COUNT(*) FROM posts WHERE user_id = $1 AND status = 'published'",
      [userId]
    );

    // Get user's ratings
    const ratingsQuery = await pool.query(
      `SELECT AVG(rating) as average_rating, COUNT(*) as total_ratings
       FROM ratings
       WHERE rated_user_id = $1`,
      [userId]
    );

    const userData = {
      ...user.rows[0],
      posts_count: parseInt(postsCount.rows[0].count),
      average_rating: parseFloat(ratingsQuery.rows[0].average_rating) || 0,
      total_ratings: parseInt(ratingsQuery.rows[0].total_ratings)
    };

    res.status(200).json(userData);
  } catch (error) {
    console.error("Error retrieving user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Update user profile (protected)
app.put('/api/users/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if the user is updating their own profile
    if (req.user.id !== parseInt(userId)) {
      return res.status(403).json({ error: "Unauthorized to update this user" });
    }

    const { Firstname, Lastname, Phone, Location, Bio, Image } = req.body;

    // Check if user exists
    const userCheck = await pool.query(
      "SELECT * FROM \"user\" WHERE \"id\" = $1 AND \"Deletedat\" IS NULL",
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    // Build update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (Firstname) {
      updates.push(`"Firstname" = $${paramCount++}`);
      values.push(Firstname);
    }

    if (Lastname) {
      updates.push(`"Lastname" = $${paramCount++}`);
      values.push(Lastname);
    }

    if (Phone) {
      updates.push(`"Phone" = $${paramCount++}`);
      values.push(Phone);
    }

    if (Location) {
      updates.push(`"Location" = $${paramCount++}`);
      values.push(Location);
    }

    if (Bio) {
      updates.push(`"Bio" = $${paramCount++}`);
      values.push(Bio);
    }

    if (Image) {
      updates.push(`"Image" = $${paramCount++}`);
      values.push(Image);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updates.push(`"Updatedat" = NOW()`);

    // Update user
    const updateQuery = `
      UPDATE "user"
      SET ${updates.join(', ')}
      WHERE "id" = $${paramCount}
      RETURNING id, "Firstname", "Lastname", "Email", "Phone", "Location", "Bio", "Image"
    `;

    values.push(userId);

    const result = await pool.query(updateQuery, values);

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get user's dashboard data (protected)
app.get('/api/dashboard', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's posts
    const posts = await pool.query(
      `SELECT * FROM posts 
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    // Get user's swap requests (sent and received)
    const sentRequests = await pool.query(
      `SELECT sr.*, 
        p.title as post_title, p.type as post_type, p.images as post_images,
        u."Firstname" as owner_firstname, u."Lastname" as owner_lastname
       FROM swap_requests sr
       JOIN posts p ON sr.post_id = p.id
       JOIN "user" u ON p.user_id = u.id
       WHERE sr.requester_id = $1
       ORDER BY sr.created_at DESC
       LIMIT 5`,
      [userId]
    );

    const receivedRequests = await pool.query(
      `SELECT sr.*, 
        p.title as post_title, p.type as post_type,
        u."Firstname" as requester_firstname, u."Lastname" as requester_lastname
       FROM swap_requests sr
       JOIN posts p ON sr.post_id = p.id
       JOIN "user" u ON sr.requester_id = u.id
       WHERE p.user_id = $1
       ORDER BY sr.created_at DESC
       LIMIT 5`,
      [userId]
    );

    // Get unread notifications count
    const notificationsCount = await pool.query(
      "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE",
      [userId]
    );

    // Get recent notifications
    const notifications = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    // Get unread messages count
    const messagesCount = await pool.query(
      `SELECT COUNT(*) FROM messages
       WHERE receiver_id = $1 AND is_read = FALSE`,
      [userId]
    );

    res.status(200).json({
      posts: posts.rows,
      swapRequests: {
        sent: sentRequests.rows,
        received: receivedRequests.rows
      },
      notifications: {
        unreadCount: parseInt(notificationsCount.rows[0].count),
        recent: notifications.rows
      },
      messages: {
        unreadCount: parseInt(messagesCount.rows[0].count)
      }
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Swap Trade Platform API is running',
    version: '1.0.0',
    endpoints: [
      '/api/items',
      '/api/services',
      '/api/swap-requests',
      '/api/notifications',
      '/api/messages',
      '/api/search',
      '/api/analytics',
      '/api/auth',
      '/api/homepage',
      '/api/users',
      '/api/dashboard'
    ]
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;