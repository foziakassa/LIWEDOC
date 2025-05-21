import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import pg from "pg"
import bodyParser from "body-parser"
import fetch from "node-fetch"

// Load environment variables
dotenv.config()

// Create Express app
const app = express()
const PORT = process.env.PORT || 5000

// Database connection
const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error("Error connecting to database:", err)
    console.error("Full error details:", err.stack)
  } else {
    console.log("Connected to PostgreSQL database")
    release()
  }
})

// Middleware
// app.use(
//   cors({
//     origin: process.env.FRONTEND_URL || "http://localhost:3000",
//     credentials: true,
//   }),
// )
app.use(cors())
app.use(bodyParser.json())

// Special handling for webhook routes
app.use("/api/payment/callback", bodyParser.raw({ type: "application/json" }))

// Helper function to execute database queries with better logging
const query = async (text, params) => {
  try {
    const start = Date.now()
    const res = await pool.query(text, params)
    const duration = Date.now() - start
    console.log("Executed query", { text, duration, rows: res.rowCount })
    return res
  } catch (error) {
    console.error("Query error:", error)
    throw error
  }
}

// API Routes

// 1. Get all plans
app.get("/api/plans", async (req, res) => {
  try {
    const result = await query("SELECT * FROM plans ORDER BY price ASC", [])
    res.status(200).json({
      success: true,
      plans: result.rows,
    })
  } catch (error) {
    console.error("Error fetching plans:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch plans",
    })
  }
})

// 2. Initialize payment
app.post("/api/payment/initialize", async (req, res) => {
  try {
    const { amount, planName, currency, customerName, customerEmail, planId } = req.body

    if (!customerEmail || !planId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: customerEmail and planId are required",
      })
    }

    // Validate email format
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    if (!emailRegex.test(customerEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      })
    }

    // Check if user exists
    const userResult = await query('SELECT * FROM "user" WHERE "Email" = $1', [customerEmail])

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please register first.",
      })
    }

    const userId = userResult.rows[0].id
    console.log("Found user with ID:", userId)

    // Get plan details
    const planResult = await query("SELECT * FROM plans WHERE id = $1", [planId])
    if (planResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      })
    }
    const plan = planResult.rows[0]

    // Generate transaction reference
    const tx_ref = `tx-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    // Create transaction record
    await query(
      "INSERT INTO transactions (user_id, plan_id, amount, currency, tx_ref, payment_status) VALUES ($1, $2, $3, $4, $5, $6)",
      [userId, planId, plan.price, currency || "ETB", tx_ref, "pending"],
    )

    // Initialize payment with Chapa
    const chapaSecretKey = process.env.CHAPA_SECRET_KEY

    const response = await fetch("https://api.chapa.co/v1/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chapaSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: plan.price.toString(),
        currency: currency || "ETB",
        tx_ref: tx_ref,
        callback_url: `${process.env.BACKEND_URL || "http://localhost:5000"}/api/payment/callback`,
        return_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/payment/success?tx_ref=${tx_ref}`,
        first_name: customerName?.split(" ")[0] || "Customer",
        last_name: customerName?.split(" ").slice(1).join(" ") || "",
        email: customerEmail,
        title: `Payment for ${plan.name} Plan (${plan.posts_count} Posts)`,
        description: `Purchase of ${plan.name} Plan with ${plan.posts_count} posts for ${plan.price} ${currency || "ETB"}`,
        phone_number: "0900000000", // Default phone number
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Chapa API error:", errorData)
      return res.status(response.status).json({
        success: false,
        message: errorData?.message || "Failed to initialize payment",
      })
    }

    const data = await response.json()

    return res.status(200).json({
      success: true,
      redirectUrl: data.data.checkout_url,
      transactionId: tx_ref,
    })
  } catch (error) {
    console.error("Payment initialization error:", error)
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while initializing payment",
    })
  }
})

// 3. Verify payment
app.get("/api/payment/verify/:txRef", async (req, res) => {
  try {
    const { txRef } = req.params

    // Check if transaction exists
    const transactionResult = await query("SELECT * FROM transactions WHERE tx_ref = $1", [txRef])

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      })
    }

    const transaction = transactionResult.rows[0]

    // If already verified and successful, return success
    if (transaction.payment_status === "successful") {
      return res.status(200).json({
        success: true,
        status: "successful",
        transaction,
      })
    }

    // Verify with Chapa
    const chapaSecretKey = process.env.CHAPA_SECRET_KEY

    const response = await fetch(`https://api.chapa.co/v1/transaction/verify/${txRef}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${chapaSecretKey}`,
        "Content-Type": "application/json",
      },
    })

    let status = "pending"
    let payment_provider_tx_id = null

    if (response.ok) {
      const data = await response.json()

      // Map Chapa status to our status
      if (data.data.status === "success") {
        status = "successful"
        payment_provider_tx_id = data.data.reference
      } else if (data.data.status === "failed") {
        status = "failed"
      }
    }

    // Update transaction status
    await query(
      "UPDATE transactions SET payment_status = $1, payment_provider_tx_id = $2, updated_at = NOW() WHERE tx_ref = $3",
      [status, payment_provider_tx_id, txRef],
    )

    // If payment successful, add posts to user account
    if (status === "successful") {
      // Get plan details
      const planResult = await query(
        "SELECT p.* FROM plans p JOIN transactions t ON p.id = t.plan_id WHERE t.tx_ref = $1",
        [txRef],
      )

      if (planResult.rows.length > 0) {
        const plan = planResult.rows[0]

        try {
          // Check if user has a posts record
          const userPostsResult = await query("SELECT * FROM user_posts WHERE user_id = $1", [transaction.user_id])

          if (userPostsResult.rows.length === 0) {
            // Create new user_posts record
            await query(
              "INSERT INTO user_posts (user_id, total_free_posts, used_free_posts, total_paid_posts, used_paid_posts) VALUES ($1, 3, 0, $2, 0)",
              [transaction.user_id, plan.posts_count],
            )
          } else {
            // Update existing record
            await query(
              "UPDATE user_posts SET total_paid_posts = total_paid_posts + $1, updated_at = NOW() WHERE user_id = $2",
              [plan.posts_count, transaction.user_id],
            )
          }
        } catch (error) {
          console.error("Error updating user posts:", error)
          // Continue even if this fails, as the payment was still successful
        }
      }
    }

    return res.status(200).json({
      success: true,
      status,
      transaction: {
        ...transaction,
        payment_status: status,
        payment_provider_tx_id,
      },
    })
  } catch (error) {
    console.error("Payment verification error:", error)
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while verifying payment",
    })
  }
})

// 4. Payment callback (webhook)
app.post("/api/payment/callback", async (req, res) => {
  try {
    // Parse the raw body
    let payload
    if (Buffer.isBuffer(req.body)) {
      payload = req.body.toString("utf8")
    } else if (typeof req.body === "string") {
      payload = req.body
    } else {
      payload = JSON.stringify(req.body)
    }

    const payloadObj = JSON.parse(payload)

    console.log("Received webhook payload:", payloadObj)

    // Process the webhook
    const { event, data } = payloadObj

    if (event === "charge.completed") {
      const txRef = data.tx_ref

      // Get transaction from database
      const transactionResult = await query("SELECT * FROM transactions WHERE tx_ref = $1", [txRef])

      if (transactionResult.rows.length === 0) {
        return res.status(404).json({ message: "Transaction not found" })
      }

      const transaction = transactionResult.rows[0]

      // Update transaction status
      await query(
        "UPDATE transactions SET payment_status = $1, payment_provider_tx_id = $2, updated_at = NOW() WHERE tx_ref = $3",
        ["successful", data.id, txRef],
      )

      // Get plan details
      const planResult = await query("SELECT * FROM plans WHERE id = $1", [transaction.plan_id])

      if (planResult.rows.length > 0) {
        const plan = planResult.rows[0]

        try {
          // Check if user has a posts record
          const userPostsResult = await query("SELECT * FROM user_posts WHERE user_id = $1", [transaction.user_id])

          if (userPostsResult.rows.length === 0) {
            // Create new user_posts record
            await query(
              "INSERT INTO user_posts (user_id, total_free_posts, used_free_posts, total_paid_posts, used_paid_posts) VALUES ($1, 3, 0, $2, 0)",
              [transaction.user_id, plan.posts_count],
            )
          } else {
            // Update existing record
            await query(
              "UPDATE user_posts SET total_paid_posts = total_paid_posts + $1, updated_at = NOW() WHERE user_id = $2",
              [plan.posts_count, transaction.user_id],
            )
          }
        } catch (error) {
          console.error("Error updating user posts:", error)
          // Continue even if this fails, as the payment was still successful
        }
      }
    }

    // Always return 200 to acknowledge receipt
    return res.status(200).json({ received: true })
  } catch (error) {
    console.error("Webhook error:", error)
    // Still return 200 to prevent retries
    return res.status(200).json({ received: true, error: error.message })
  }
})

// 5. Get user's posts status
app.get("/api/user/posts-status", async (req, res) => {
  try {
    const email = req.headers["x-user-email"]

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "User email is required",
      })
    }

    // Get user by email
    const userResult = await query('SELECT * FROM "user" WHERE "Email" = $1', [email])

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    const userId = userResult.rows[0].id

    try {
      // Get user posts status
      let userPostsResult = await query("SELECT * FROM user_posts WHERE user_id = $1", [userId])

      // If no record exists, create one
      if (userPostsResult.rows.length === 0) {
        userPostsResult = await query(
          "INSERT INTO user_posts (user_id, total_free_posts, used_free_posts, total_paid_posts, used_paid_posts) VALUES ($1, 3, 0, 0, 0) RETURNING *",
          [userId],
        )
      }

      const postsData = userPostsResult.rows[0]

      return res.status(200).json({
        success: true,
        remainingFreePosts: Math.max(0, postsData.total_free_posts - postsData.used_free_posts),
        remainingPaidPosts: Math.max(0, postsData.total_paid_posts - postsData.used_paid_posts),
        totalPaidPosts: postsData.total_paid_posts,
        usedPaidPosts: postsData.used_paid_posts,
        totalFreePosts: postsData.total_free_posts,
      })
    } catch (error) {
      console.error("Error with user posts:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve or create user posts record",
      })
    }
  } catch (error) {
    console.error("Get posts status error:", error)
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while getting posts status",
    })
  }
})

// 6. Create a post (decrements post count)
app.post("/api/user/create-post", async (req, res) => {
  try {
    const email = req.headers["x-user-email"]
    const postData = req.body

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "User email is required",
      })
    }

    // Get user by email
    const userResult = await query('SELECT * FROM "user" WHERE "Email" = $1', [email])

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    const userId = userResult.rows[0].id

    try {
      // Get user posts status
      let userPostsResult = await query("SELECT * FROM user_posts WHERE user_id = $1", [userId])

      // If no record exists, create one
      if (userPostsResult.rows.length === 0) {
        userPostsResult = await query(
          "INSERT INTO user_posts (user_id, total_free_posts, used_free_posts, total_paid_posts, used_paid_posts) VALUES ($1, 3, 0, 0, 0) RETURNING *",
          [userId],
        )
      }

      const postsData = userPostsResult.rows[0]
      const remainingFreePosts = Math.max(0, postsData.total_free_posts - postsData.used_free_posts)
      const remainingPaidPosts = Math.max(0, postsData.total_paid_posts - postsData.used_paid_posts)
      const hasAvailablePosts = remainingPaidPosts > 0 || remainingFreePosts > 0

      if (!hasAvailablePosts) {
        return res.status(403).json({
          success: false,
          message: "No posts remaining. Please purchase a plan to continue posting.",
        })
      }

      // Determine which type of post to use (paid first, then free)
      let updatedPostsResult
      if (remainingPaidPosts > 0) {
        // Use a paid post
        updatedPostsResult = await query(
          "UPDATE user_posts SET used_paid_posts = used_paid_posts + 1, updated_at = NOW() WHERE user_id = $1 RETURNING *",
          [userId],
        )
      } else {
        // Use a free postmmmmmm
        updatedPostsResult = await query(
          "UPDATE user_posts SET used_free_posts = used_free_posts + 1, updated_at = NOW() WHERE user_id = $1 RETURNING *",
          [userId],
        )
      }

      const updatedPostsData = updatedPostsResult.rows[0]

      // Here you would actually create the post in your database
      // For this example, we're just returning the updated post status

      return res.status(200).json({
        success: true,
        message: "Post created successfully",
        postsStatus: {
          remainingFreePosts: Math.max(0, updatedPostsData.total_free_posts - updatedPostsData.used_free_posts),
          remainingPaidPosts: Math.max(0, updatedPostsData.total_paid_posts - updatedPostsData.used_paid_posts),
          totalPaidPosts: updatedPostsData.total_paid_posts,
          usedPaidPosts: updatedPostsData.used_paid_posts,
          totalFreePosts: updatedPostsData.total_free_posts,
        },
      })
    } catch (error) {
      console.error("Error with user posts:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve or update user posts record",
      })
    }
  } catch (error) {
    console.error("Create post error:", error)
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while creating post",
    })
  }
})

// 7. Get payment receipt
app.get("/api/payment/receipt/:txRef", async (req, res) => {
  try {
    const { txRef } = req.params
    const email = req.headers["x-user-email"]

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "User email is required",
      })
    }

    // Get transaction details with user and plan info
    const result = await query(
      `
      SELECT 
        t.id, t.amount, t.currency, t.tx_ref, t.payment_status, t.created_at,
        u."Firstname" as first_name, u."Lastname" as last_name, u."Email" as email,
        p.name as plan_name, p.posts_count
      FROM transactions t
      JOIN "user" u ON t.user_id = u.id
      JOIN plans p ON t.plan_id = p.id
      WHERE t.tx_ref = $1 AND u."Email" = $2
      `,
      [txRef, email],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Receipt not found",
      })
    }

    const receipt = result.rows[0]

    return res.status(200).json({
      success: true,
      receipt: {
        transactionId: receipt.tx_ref,
        date: receipt.created_at,
        customerName: `${receipt.first_name} ${receipt.last_name}`,
        customerEmail: receipt.email,
        plan: receipt.plan_name,
        postsCount: receipt.posts_count,
        price: receipt.amount,
        currency: receipt.currency,
        status: receipt.payment_status,
      },
    })
  } catch (error) {
    console.error("Get receipt error:", error)
    res.status(500).json({
      success: false,
      message: error.message || "An error occurred while getting receipt",
    })
  }
})


// 8. Get all transactions
app.get("/api/transactions", async (req, res) => {
  try {
    const result = await query(
      `
      SELECT 
        t.id, t.amount, t.currency, t.tx_ref, t.payment_status, t.created_at,
        u."Firstname" as first_name, u."Lastname" as last_name, u."Email" as email,
        p.name as plan_name
      FROM transactions t
      JOIN "user" u ON t.user_id = u.id
      JOIN plans p ON t.plan_id = p.id
      ORDER BY t.created_at DESC
      `,
      [],
    )

    res.status(200).json({
      success: true,
      transactions: result.rows.map((row) => ({
        id: row.id,
        amount: row.amount,
        currency: row.currency,
        transactionId: row.tx_ref,
        paymentStatus: row.payment_status,
        date: row.created_at,
        customerName: `${row.first_name} ${row.last_name}`,
        customerEmail: row.email,
        planName: row.plan_name,
      })),
    })
  } catch (error) {
    console.error("Error fetching transactions:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
    })
  }
})


// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Server is running" })
})

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
