const { Pool } = require('pg');
const nodemailer = require('nodemailer');

// Configure PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Configure email transporter
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Extract user ID from URL path
  const urlParts = req.url.split('/');
  const userId = urlParts[urlParts.length - 1];

  if (req.method === 'PUT') {
    const { firstName, lastName, email, phone, bio, location } = req.body;

    // Basic validation
    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, and email are required',
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    try {
      // Check if user exists
      const userCheck = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

      if (userCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Check if email is already taken by another user
      const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, userId]);
      
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Email address is already in use by another account',
        });
      }

      // Update user profile
      const result = await pool.query(
        `UPDATE users 
         SET first_name = $1, last_name = $2, email = $3, phone = $4, bio = $5, location = $6, updated_at = NOW() 
         WHERE id = $7 
         RETURNING id, first_name, last_name, email, phone, bio, location, created_at, updated_at`,
        [firstName, lastName, email, phone || null, bio || null, location || null, userId],
      );

      // Send confirmation email (optional - don't fail if email fails)
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'Profile Updated Successfully',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2563eb;">Profile Update Confirmation</h2>
              <p>Hello ${firstName},</p>
              <p>Your profile has been successfully updated with the following information:</p>
              <ul>
                <li><strong>Name:</strong> ${firstName} ${lastName}</li>
                <li><strong>Email:</strong> ${email}</li>
                <li><strong>Phone:</strong> ${phone || 'Not provided'}</li>
                <li><strong>Location:</strong> ${location || 'Not provided'}</li>
              </ul>
              <p>If you did not make this change, please contact our support team immediately.</p>
              <p>Best regards,<br>Your App Team</p>
            </div>
          `,
        });
        console.log('Confirmation email sent to:', email);
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError.message);
        // Continue with success response even if email fails
      }

      return res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        user: {
          id: result.rows[0].id,
          firstName: result.rows[0].first_name,
          lastName: result.rows[0].last_name,
          email: result.rows[0].email,
          phone: result.rows[0].phone,
          bio: result.rows[0].bio,
          location: result.rows[0].location,
          createdAt: result.rows[0].created_at,
          updatedAt: result.rows[0].updated_at,
        },
      });

    } catch (error) {
      console.error('Error updating profile:', error);
      
      // Handle specific database errors
      if (error.code === '23505') { // Unique constraint violation
        return res.status(409).json({
          success: false,
          message: 'Email address is already in use',
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Internal server error while updating profile',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
      });
    }
  } else {
    // Method not allowed
    return res.status(405).json({
      success: false,
      message: `Method ${req.method} not allowed. Use PUT to update profile.`,
    });
  }
};