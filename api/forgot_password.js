// Add these endpoints to your existing Express server file
const express = require("express")
const crypto = require("crypto")
const { Pool } = require("pg")
const nodemailer = require("nodemailer")
const bcrypt = require("bcrypt")
const app = express()

// PostgreSQL connection pool configuration
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false, // For development; consider proper SSL configuration in production
  },
})

// Nodemailer transporter configuration
const transporter = nodemailer.createTransport({
  service: "gmail", // Use your email service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

// Forgot Password API
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: "Email is required." })
  }

  try {
    // Check if user exists in 'users' table
    const userCheck = await pool.query("SELECT * FROM users WHERE email = $1", [email])
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "No account found with this email address." })
    }

    const user = userCheck.rows[0]

    // Generate a password reset token
    const resetToken = crypto.randomBytes(32).toString("hex")

    // Delete any existing reset tokens for this user
    await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [user.id])

    // Store the reset token in the database (expires in 1 hour)
    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token, created_at, expires_at) VALUES ($1, $2, NOW(), NOW() + interval '1 hour')",
      [user.id, resetToken],
    )

    // Create the password reset link using environment variable
    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`

    // Send password reset email using environment variables
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Request - LWIE",
      text: `You requested a password reset. Click the following link to reset your password: ${resetLink}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #0d9488;">LWIE</h1>
          </div>
          <h2 style="color: #374151;">Password Reset Request</h2>
          <p style="color: #6b7280; line-height: 1.6;">You requested a password reset for your LWIE account.</p>
          <p style="color: #6b7280; line-height: 1.6;">Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #0d9488; color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">Reset Password</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #0d9488; font-size: 14px;">${resetLink}</p>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px;">This link will expire in 1 hour.</p>
            <p style="color: #9ca3af; font-size: 12px;">If you didn't request this password reset, please ignore this email.</p>
          </div>
        </div>
      `,
    })

    return res.status(200).json({ message: "Password reset link has been sent to your email address." })
  } catch (err) {
    console.error("Forgot password error:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

// Verify Reset Token API
app.post("/api/verify-reset-token", async (req, res) => {
  const { token } = req.body

  if (!token) {
    return res.status(400).json({ error: "Token is required." })
  }

  try {
    // Check if the token is valid and not expired
    const result = await pool.query("SELECT * FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()", [
      token,
    ])

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired reset token." })
    }

    return res.status(200).json({ message: "Token is valid." })
  } catch (err) {
    console.error("Verify reset token error:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

// Reset Password API
app.post("/api/reset-password", async (req, res) => {
  const { token, password } = req.body

  if (!token || !password) {
    return res.status(400).json({ error: "Token and password are required." })
  }

  // Validate password strength
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      error:
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character, and be at least 8 characters long.",
    })
  }

  try {
    // Check if the token is valid and not expired
    const tokenResult = await pool.query(
      "SELECT * FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()",
      [token],
    )

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired reset token." })
    }

    const resetTokenData = tokenResult.rows[0]

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Update the user's password in 'users' table
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedPassword, resetTokenData.user_id])

    // Delete the used reset token
    await pool.query("DELETE FROM password_reset_tokens WHERE token = $1", [token])

    // Send confirmation email
    const user = await pool.query("SELECT email, firstname FROM users WHERE id = $1", [resetTokenData.user_id])
    if (user.rows.length > 0) {
      const userData = user.rows[0]
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: userData.email,
        subject: "Password Reset Successful - LWIE",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #0d9488;">LWIE</h1>
            </div>
            <h2 style="color: #374151;">Password Reset Successful</h2>
            <p style="color: #6b7280; line-height: 1.6;">Hello ${userData.firstname},</p>
            <p style="color: #6b7280; line-height: 1.6;">Your password has been successfully reset. You can now log in with your new password.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/login" style="display: inline-block; padding: 12px 24px; background-color: #0d9488; color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">Login Now</a>
            </div>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px;">If you didn't reset your password, please contact our support team immediately.</p>
            </div>
          </div>
        `,
      })
    }

    return res.status(200).json({ message: "Password has been reset successfully." })
  } catch (err) {
    console.error("Reset password error:", err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})
