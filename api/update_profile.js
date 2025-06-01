const { Pool } = require('pg');

// Configure PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 1, // Limit connections for serverless
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Helper function to validate email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Helper function to validate phone number
const isValidPhone = (phone) => {
  if (!phone) return true; // Phone is optional
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone.replace(/[\s\-$$$$]/g, ''));
};

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let client;
  
  try {
    // Extract user ID from URL
    const urlParts = req.url.split('/');
    const userId = urlParts[urlParts.length - 1];

    // Validate user ID
    if (!userId || userId === 'user_profile' || isNaN(parseInt(userId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid user ID is required in the URL path',
        example: '/api/user_profile/123'
      });
    }

    // Connect to database
    client = await pool.connect();

    // Handle different HTTP methods
    switch (req.method) {
      case 'GET':
        return await handleGetProfile(req, res, client, userId);
      case 'PUT':
        return await handleUpdateProfile(req, res, client, userId);
      default:
        return res.status(405).json({
          success: false,
          message: `Method ${req.method} not allowed. Supported methods: GET, PUT`,
        });
    }

  } catch (error) {
    console.error('API Error:', error);
    
    // Handle specific database errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({
        success: false,
        message: 'Database connection failed. Please try again later.',
      });
    }

    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        message: 'Email address is already in use by another account',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};

// Handle GET request - Get user profile
async function handleGetProfile(req, res, client, userId) {
  try {
    const result = await client.query(
      'SELECT id, first_name, last_name, email, phone, bio, location, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const user = result.rows[0];
    
    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        bio: user.bio,
        location: user.location,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    throw error;
  }
}

// Handle PUT request - Update user profile
async function handleUpdateProfile(req, res, client, userId) {
  try {
    // Parse request body
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON format in request body',
      });
    }

    const { firstName, lastName, email, phone, bio, location } = body;

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: 'firstName, lastName, and email are required fields',
        received: { firstName: !!firstName, lastName: !!lastName, email: !!email }
      });
    }

    // Validate field lengths
    if (firstName.length > 50 || lastName.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'First name and last name must be 50 characters or less',
      });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    // Validate phone number if provided
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid phone number',
      });
    }

    // Validate bio length
    if (bio && bio.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Bio must be 500 characters or less',
      });
    }

    // Validate location length
    if (location && location.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Location must be 100 characters or less',
      });
    }

    // Check if user exists
    const userCheck = await client.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if email is already taken by another user
    const emailCheck = await client.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email.toLowerCase().trim(), userId]
    );
    
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email address is already in use by another account',
      });
    }

    // Update user profile
    const updateResult = await client.query(
      `UPDATE users 
       SET first_name = $1, 
           last_name = $2, 
           email = $3, 
           phone = $4, 
           bio = $5, 
           location = $6, 
           updated_at = NOW() 
       WHERE id = $7 
       RETURNING id, first_name, last_name, email, phone, bio, location, created_at, updated_at`,
      [
        firstName.trim(),
        lastName.trim(),
        email.toLowerCase().trim(),
        phone ? phone.trim() : null,
        bio ? bio.trim() : null,
        location ? location.trim() : null,
        userId
      ]
    );

    const updatedUser = updateResult.rows[0];

    // Log successful update
    console.log(`Profile updated successfully for user ${userId}: ${email}`);

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        bio: updatedUser.bio,
        location: updatedUser.location,
        createdAt: updatedUser.created_at,
        updatedAt: updatedUser.updated_at,
      },
    });

  } catch (error) {
    throw error;
  }
}