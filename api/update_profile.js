const { Pool } = require('pg');

// Use your exact DATABASE_URL from .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://fozia:wNlGDFpeaxZrxX4VDZIx4ypqVhiiSpNh@dpg-cvmcuu8dl3ps73d9qec0-a.oregon-postgres.render.com:5432/lwie_n25z',
  ssl: {
    rejectUnauthorized: false
  },
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let client;

  try {
    // Extract user ID from URL path
    const urlParts = req.url.split('/');
    const userId = urlParts[urlParts.length - 1];

    console.log('Request URL:', req.url);
    console.log('User ID extracted:', userId);
    console.log('Request method:', req.method);

    // Validate user ID
    if (!userId || userId === 'user_profile' || isNaN(parseInt(userId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid user ID is required',
        debug: { 
          userId, 
          url: req.url,
          urlParts 
        }
      });
    }

    // Connect to database
    client = await pool.connect();
    console.log('Database connected successfully');

    if (req.method === 'GET') {
      // GET user profile
      console.log('Executing GET request for user:', userId);
      
      const result = await client.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );

      console.log('Query result rows:', result.rows.length);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          userId: userId
        });
      }

      const user = result.rows[0];
      
      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          firstName: user.first_name || user.firstname,
          lastName: user.last_name || user.lastname,
          email: user.email,
          phone: user.phone,
          bio: user.bio,
          location: user.location,
          createdAt: user.created_at,
          updatedAt: user.updated_at
        }
      });

    } else if (req.method === 'PUT') {
      // UPDATE user profile
      console.log('Executing PUT request for user:', userId);
      console.log('Request body:', req.body);

      const { firstName, lastName, email, phone, bio, location } = req.body;

      // Basic validation
      if (!firstName || !lastName || !email) {
        return res.status(400).json({
          success: false,
          message: 'firstName, lastName, and email are required',
          received: { firstName, lastName, email }
        });
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address'
        });
      }

      // Check if user exists first
      const userCheck = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
      
      if (userCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      console.log('User exists, proceeding with update');

      // Check if email is already taken by another user
      const emailCheck = await client.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email.toLowerCase().trim(), userId]
      );
      
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Email address is already in use by another account'
        });
      }

      // Update user profile - try both column name formats
      let updateQuery;
      let updateParams;

      // First, let's check what columns exist in the users table
      const tableInfo = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users'
      `);
      
      const columns = tableInfo.rows.map(row => row.column_name);
      console.log('Available columns in users table:', columns);

      // Determine column names based on what exists
      const firstNameCol = columns.includes('first_name') ? 'first_name' : 'firstname';
      const lastNameCol = columns.includes('last_name') ? 'last_name' : 'lastname';
      const updatedAtCol = columns.includes('updated_at') ? 'updated_at' : 'updatedat';

      updateQuery = `
        UPDATE users 
        SET ${firstNameCol} = $1, 
            ${lastNameCol} = $2, 
            email = $3, 
            phone = $4, 
            bio = $5, 
            location = $6
            ${columns.includes('updated_at') || columns.includes('updatedat') ? `, ${updatedAtCol} = NOW()` : ''}
        WHERE id = $7 
        RETURNING *
      `;

      updateParams = [
        firstName.trim(),
        lastName.trim(),
        email.toLowerCase().trim(),
        phone ? phone.trim() : null,
        bio ? bio.trim() : null,
        location ? location.trim() : null,
        userId
      ];

      console.log('Update query:', updateQuery);
      console.log('Update params:', updateParams);

      const result = await client.query(updateQuery, updateParams);
      const updatedUser = result.rows[0];

      console.log('Update successful');

      return res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          firstName: updatedUser[firstNameCol],
          lastName: updatedUser[lastNameCol],
          email: updatedUser.email,
          phone: updatedUser.phone,
          bio: updatedUser.bio,
          location: updatedUser.location,
          createdAt: updatedUser.created_at || updatedUser.createdat,
          updatedAt: updatedUser.updated_at || updatedUser.updatedat
        }
      });

    } else {
      return res.status(405).json({
        success: false,
        message: `Method ${req.method} not allowed. Use GET or PUT.`
      });
    }

  } catch (error) {
    console.error('API Error:', error);
    console.error('Error stack:', error.stack);
    
    // Handle specific database errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({
        success: false,
        message: 'Database connection failed',
        error: error.message
      });
    }

    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        message: 'Email address is already in use'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
      code: error.code
    });

  } finally {
    if (client) {
      client.release();
      console.log('Database connection released');
    }
  }
};