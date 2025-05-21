-- Drop existing tables if they exist to rebuild with correct constraints
DROP TABLE IF EXISTS user_posts;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS plans;

-- Create plans table
CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  posts_count INTEGER NOT NULL,
  description TEXT,
  is_popular BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create transactions table with correct reference to "user" table
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
);

-- Create user_posts table with correct reference to "user" table
CREATE TABLE IF NOT EXISTS user_posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES "user"(id),
  total_free_posts INTEGER DEFAULT 3,
  used_free_posts INTEGER DEFAULT 0,
  total_paid_posts INTEGER DEFAULT 0,
  used_paid_posts INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default plans
INSERT INTO plans (name, price, posts_count, description, is_popular)
VALUES 
  ('Basic', 15, 5, 'Perfect for occasional users', FALSE),
  ('Standard', 20, 7, 'Great for regular users', TRUE),
  ('Premium', 30, 15, 'For power users and businesses', FALSE);

-- Create or replace timestamp function
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers with existence checks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_transactions_modtime'
  ) THEN
    CREATE TRIGGER update_transactions_modtime
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_user_posts_modtime'
  ) THEN
    CREATE TRIGGER update_user_posts_modtime
    BEFORE UPDATE ON user_posts
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();
  END IF;
END
$$;
