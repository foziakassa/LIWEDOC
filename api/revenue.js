import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import pg from "pg"

// Load environment variables
dotenv.config()

// Database connection
const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

// Helper function to execute database queries
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

// Main handler function for Vercel
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-email')
  
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  const { url, method } = req

  try {
    // Route: Get total revenue from all sources
    if (url === '/api/revenue/total' && method === 'GET') {
      // Get total revenue from transactions (only successful payments)
      const transactionRevenueQuery = `
        SELECT COALESCE(SUM(amount), 0) as total_transaction_revenue 
        FROM transactions 
        WHERE payment_status = 'successful'
      `
      
      // Get total revenue from advertisements (only approved ads)
      const advertisementRevenueQuery = `
        SELECT COALESCE(SUM(payment_amount), 0) as total_advertisement_revenue 
        FROM advertisements 
        WHERE approved = true
      `
      
      const [transactionResult, advertisementResult] = await Promise.all([
        query(transactionRevenueQuery, []),
        query(advertisementRevenueQuery, [])
      ])
      
      const transactionRevenue = parseFloat(transactionResult.rows[0].total_transaction_revenue) || 0
      const advertisementRevenue = parseFloat(advertisementResult.rows[0].total_advertisement_revenue) || 0
      const totalRevenue = transactionRevenue + advertisementRevenue
      
      return res.status(200).json({
        success: true,
        data: {
          transactionRevenue: transactionRevenue,
          advertisementRevenue: advertisementRevenue,
          totalRevenue: totalRevenue,
          currency: "ETB"
        }
      })
    }

    // Route: Get revenue breakdown by source
    if (url === '/api/revenue/breakdown' && method === 'GET') {
      // Get detailed transaction revenue breakdown
      const transactionBreakdownQuery = `
        SELECT 
          COUNT(*) as transaction_count,
          SUM(amount) as total_amount,
          AVG(amount) as average_amount,
          MIN(amount) as min_amount,
          MAX(amount) as max_amount
        FROM transactions 
        WHERE payment_status = 'successful'
      `
      
      // Get detailed advertisement revenue breakdown
      const advertisementBreakdownQuery = `
        SELECT 
          COUNT(*) as advertisement_count,
          SUM(payment_amount) as total_amount,
          AVG(payment_amount) as average_amount,
          MIN(payment_amount) as min_amount,
          MAX(payment_amount) as max_amount
        FROM advertisements 
        WHERE approved = true AND payment_amount IS NOT NULL
      `
      
      const [transactionResult, advertisementResult] = await Promise.all([
        query(transactionBreakdownQuery, []),
        query(advertisementBreakdownQuery, [])
      ])
      
      const transactionData = transactionResult.rows[0]
      const advertisementData = advertisementResult.rows[0]
      
      return res.status(200).json({
        success: true,
        data: {
          transactions: {
            count: parseInt(transactionData.transaction_count) || 0,
            totalRevenue: parseFloat(transactionData.total_amount) || 0,
            averageAmount: parseFloat(transactionData.average_amount) || 0,
            minAmount: parseFloat(transactionData.min_amount) || 0,
            maxAmount: parseFloat(transactionData.max_amount) || 0
          },
          advertisements: {
            count: parseInt(advertisementData.advertisement_count) || 0,
            totalRevenue: parseFloat(advertisementData.total_amount) || 0,
            averageAmount: parseFloat(advertisementData.average_amount) || 0,
            minAmount: parseFloat(advertisementData.min_amount) || 0,
            maxAmount: parseFloat(advertisementData.max_amount) || 0
          },
          currency: "ETB"
        }
      })
    }

    // Route: Get revenue by date range
    if (url.startsWith('/api/revenue/date-range') && method === 'GET') {
      const urlParams = new URLSearchParams(url.split('?')[1])
      const startDate = urlParams.get('startDate')
      const endDate = urlParams.get('endDate')
      
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "startDate and endDate query parameters are required (YYYY-MM-DD format)"
        })
      }
      
      // Get transaction revenue for date range
      const transactionRevenueQuery = `
        SELECT COALESCE(SUM(amount), 0) as total_transaction_revenue 
        FROM transactions 
        WHERE payment_status = 'successful' 
        AND DATE(created_at) BETWEEN $1 AND $2
      `
      
      // Get advertisement revenue for date range
      const advertisementRevenueQuery = `
        SELECT COALESCE(SUM(payment_amount), 0) as total_advertisement_revenue 
        FROM advertisements 
        WHERE approved = true 
        AND DATE(created_at) BETWEEN $1 AND $2
      `
      
      const [transactionResult, advertisementResult] = await Promise.all([
        query(transactionRevenueQuery, [startDate, endDate]),
        query(advertisementRevenueQuery, [startDate, endDate])
      ])
      
      const transactionRevenue = parseFloat(transactionResult.rows[0].total_transaction_revenue) || 0
      const advertisementRevenue = parseFloat(advertisementResult.rows[0].total_advertisement_revenue) || 0
      const totalRevenue = transactionRevenue + advertisementRevenue
      
      return res.status(200).json({
        success: true,
        data: {
          dateRange: {
            startDate,
            endDate
          },
          transactionRevenue: transactionRevenue,
          advertisementRevenue: advertisementRevenue,
          totalRevenue: totalRevenue,
          currency: "ETB"
        }
      })
    }

    // Route: Get monthly revenue summary
    if (url.startsWith('/api/revenue/monthly') && method === 'GET') {
      const urlParams = new URLSearchParams(url.split('?')[1])
      const year = urlParams.get('year') || new Date().getFullYear()
      
      // Get monthly transaction revenue
      const monthlyTransactionQuery = `
        SELECT 
          EXTRACT(MONTH FROM created_at) as month,
          COALESCE(SUM(amount), 0) as monthly_revenue
        FROM transactions 
        WHERE payment_status = 'successful' 
        AND EXTRACT(YEAR FROM created_at) = $1
        GROUP BY EXTRACT(MONTH FROM created_at)
        ORDER BY month
      `
      
      // Get monthly advertisement revenue
      const monthlyAdvertisementQuery = `
        SELECT 
          EXTRACT(MONTH FROM created_at) as month,
          COALESCE(SUM(payment_amount), 0) as monthly_revenue
        FROM advertisements 
        WHERE approved = true 
        AND EXTRACT(YEAR FROM created_at) = $1
        GROUP BY EXTRACT(MONTH FROM created_at)
        ORDER BY month
      `
      
      const [transactionResult, advertisementResult] = await Promise.all([
        query(monthlyTransactionQuery, [year]),
        query(monthlyAdvertisementQuery, [year])
      ])
      
      // Create monthly summary
      const monthlyData = []
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ]
      
      for (let month = 1; month <= 12; month++) {
        const transactionData = transactionResult.rows.find(row => parseInt(row.month) === month)
        const advertisementData = advertisementResult.rows.find(row => parseInt(row.month) === month)
        
        const transactionRevenue = transactionData ? parseFloat(transactionData.monthly_revenue) : 0
        const advertisementRevenue = advertisementData ? parseFloat(advertisementData.monthly_revenue) : 0
        
        monthlyData.push({
          month: month,
          monthName: monthNames[month - 1],
          transactionRevenue: transactionRevenue,
          advertisementRevenue: advertisementRevenue,
          totalRevenue: transactionRevenue + advertisementRevenue
        })
      }
      
      const yearlyTotal = monthlyData.reduce((sum, month) => sum + month.totalRevenue, 0)
      
      return res.status(200).json({
        success: true,
        data: {
          year: parseInt(year),
          monthlyBreakdown: monthlyData,
          yearlyTotal: yearlyTotal,
          currency: "ETB"
        }
      })
    }

    // Health check
    if (url === '/api/revenue/health' && method === 'GET') {
      return res.status(200).json({ 
        status: "ok", 
        message: "Revenue API is running",
        timestamp: new Date().toISOString()
      })
    }

    // Route not found
    return res.status(404).json({
      success: false,
      message: "Revenue API endpoint not found"
    })

  } catch (error) {
    console.error("Revenue API error:", error)
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    })
  }
}