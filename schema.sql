-- Create user table if it doesn't exist (this should match your existing user table)
CREATE TABLE IF NOT EXISTS "user" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Firstname" TEXT NOT NULL,
  "Lastname" TEXT NOT NULL,
  "Email" TEXT NOT NULL UNIQUE,
  "Password" TEXT NOT NULL,
  "Role" TEXT DEFAULT 'User',
  "Createdat" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "Updatedat" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "Deletedat" TIMESTAMP WITH TIME ZONE
);

-- Create posts table if it doesn't exist
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('item', 'service')),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  subcategory TEXT,
  condition TEXT,
  price DECIMAL(10, 2),
  brand TEXT,
  model TEXT,
  additional_details JSONB,
  city TEXT,
  subcity TEXT,
  location TEXT,
  images TEXT[],
  trade_preferences JSONB,
  service_details JSONB,
  contact_info JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  views INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create swap requests table
CREATE TABLE IF NOT EXISTS swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL,
  requester_item_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  message TEXT,
  contact_info JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create messages table for communication between users
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swap_request_id UUID REFERENCES swap_requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create favorites table
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS posts_user_id_idx ON posts(user_id);
CREATE INDEX IF NOT EXISTS posts_type_idx ON posts(type);
CREATE INDEX IF NOT EXISTS posts_status_idx ON posts(status);
CREATE INDEX IF NOT EXISTS posts_category_idx ON posts(category);
CREATE INDEX IF NOT EXISTS swap_requests_post_id_idx ON swap_requests(post_id);
CREATE INDEX IF NOT EXISTS swap_requests_requester_id_idx ON swap_requests(requester_id);
CREATE INDEX IF NOT EXISTS swap_requests_status_idx ON swap_requests(status);
CREATE INDEX IF NOT EXISTS messages_swap_request_id_idx ON messages(swap_request_id);
CREATE INDEX IF NOT EXISTS messages_sender_receiver_idx ON messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications(is_read);
CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON favorites(user_id);
CREATE INDEX IF NOT EXISTS favorites_post_id_idx ON favorites(post_id);