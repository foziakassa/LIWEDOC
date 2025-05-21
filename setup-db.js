import pg from "pg"
import dotenv from "dotenv"

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

async function setupDatabase() {
  const client = await pool.connect()

  try {
    console.log("Starting database setup...")

    // Begin transaction
    await client.query("BEGIN")

    // Drop existing tables if they exist
    console.log("Dropping existing tables if they exist...")
    await client.query(`
      DROP TABLE IF EXISTS user_posts;
      DROP TABLE IF EXISTS transactions;
      DROP TABLE IF EXISTS plans;
    `)

    // Create plans table
    console.log("Creating plans table...")
    await client.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        posts_count INTEGER NOT NULL,
        description TEXT,
        is_popular BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create transactions table
    console.log("Creating transactions table...")
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES "user"(id),
        plan_id INTEGER REFERENCES plans(id),
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'ETB',
        tx_ref VARCHAR(255) UNIQUE NOT NULL,
        payment_status VARCHAR(50) DEFAULT 'pending',
        payment_provider VARCHAR(50) DEFAULT 'chapa',
        payment_provider_tx_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create user_posts table
    console.log("Creating user_posts table...")
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES "user"(id),
        total_free_posts INTEGER DEFAULT 3,
        used_free_posts INTEGER DEFAULT 0,
        total_paid_posts INTEGER DEFAULT 0,
        used_paid_posts INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert default plans
    console.log("Inserting default plans...")
    await client.query(`
      INSERT INTO plans (name, price, posts_count, description, is_popular)
      VALUES 
        ('Basic', 15, 5, 'Perfect for occasional users', FALSE),
        ('Standard', 20, 7, 'Great for regular users', TRUE),
        ('Premium', 30, 15, 'For power users and businesses', FALSE)
    `)

    // Create update_modified_column function
    console.log("Creating update_modified_column function...")
    await client.query(`
      CREATE OR REPLACE FUNCTION update_modified_column()
      RETURNS TRIGGER AS $$
      BEGIN
         NEW.updated_at = NOW();
         RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `)

    // Create triggers
    console.log("Creating triggers...")

    // Check if trigger exists before creating
    const transactionTriggerExists = await client.query(`
      SELECT 1 FROM pg_trigger WHERE tgname = 'update_transactions_modtime'
    `)

    if (transactionTriggerExists.rows.length === 0) {
      await client.query(`
        CREATE TRIGGER update_transactions_modtime
        BEFORE UPDATE ON transactions
        FOR EACH ROW EXECUTE FUNCTION update_modified_column()
      `)
    }

    const userPostsTriggerExists = await client.query(`
      SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_posts_modtime'
    `)

    if (userPostsTriggerExists.rows.length === 0) {
      await client.query(`
        CREATE TRIGGER update_user_posts_modtime
        BEFORE UPDATE ON user_posts
        FOR EACH ROW EXECUTE FUNCTION update_modified_column()
      `)
    }

    // Commit transaction
    await client.query("COMMIT")

    console.log("Database setup completed successfully!")
  } catch (error) {
    // Rollback transaction on error
    await client.query("ROLLBACK")
    console.error("Error during database setup:", error.message)
    console.error("Full error:", error)
  } finally {
    client.release()
    process.exit(0)
  }
}

setupDatabase()
