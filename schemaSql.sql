-- User table
CREATE TABLE "user" (
    "id" SERIAL PRIMARY KEY,
    "email" VARCHAR(255) UNIQUE NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "bio" TEXT,
    "location" VARCHAR(255),
    "profile_image" VARCHAR(255),
    "biometric_data" JSONB,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Categories Table (for both items and services)
CREATE TABLE categories (
    "id" SERIAL PRIMARY KEY,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(20) NOT NULL CHECK ("type" IN ('item', 'service')),
    "parent_id" INTEGER REFERENCES categories("id"),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert some common categories
INSERT INTO categories ("name", "type") VALUES 
('Electronics', 'item'),
('Furniture', 'item'),
('Vehicles', 'item'),
('Clothing', 'item'),
('Home Services', 'service'),
('Tutoring', 'service'),
('Repairs', 'service'),
('Beauty', 'service');

-- Items Table
CREATE TABLE items (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL REFERENCES "user"("id"),
    "title" VARCHAR(100) NOT NULL,
    "category_id" INTEGER NOT NULL REFERENCES categories("id"),
    "description" TEXT,
    "condition" VARCHAR(50),
    "location" VARCHAR(100),
    "status" VARCHAR(20) DEFAULT 'draft' CHECK ("status" IN ('draft', 'published', 'traded', 'removed')),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "trade_type" VARCHAR(20) CHECK ("trade_type" IN ('itemForItem', 'itemForService', 'openToAll')),
    "accept_cash" BOOLEAN DEFAULT FALSE
);

-- Indexes for better performance
CREATE INDEX idx_items_user ON items("user_id");
CREATE INDEX idx_items_category ON items("category_id");
CREATE INDEX idx_items_status ON items("status");

-- Item Specifications Table
CREATE TABLE item_specifications (
    "id" SERIAL PRIMARY KEY,
    "item_id" INTEGER NOT NULL REFERENCES items("id") ON DELETE CASCADE,
    "brand" VARCHAR(50),
    "model" VARCHAR(50),
    "year" INTEGER,
    "specifications" JSONB,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster item lookups
CREATE INDEX idx_item_specs_item ON item_specifications("item_id");

-- Services Table
CREATE TABLE services (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL REFERENCES "user"("id"),
    "title" VARCHAR(100) NOT NULL,
    "category_id" INTEGER NOT NULL REFERENCES categories("id"),
    "description" TEXT,
    "hourly_rate" DECIMAL(10,2),
    "location" VARCHAR(100),
    "status" VARCHAR(20) DEFAULT 'draft' CHECK ("status" IN ('draft', 'published', 'unavailable', 'removed')),
    "time_estimation" INTEGER,
    "time_unit" VARCHAR(10) CHECK ("time_unit" IN ('hours', 'days', 'weeks', 'months')),
    "cancellation_policy" VARCHAR(20) CHECK ("cancellation_policy" IN ('flexible', 'moderate', 'strict', 'nonRefundable')),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "trade_type" VARCHAR(20) CHECK ("trade_type" IN ('serviceForItem', 'serviceForService', 'openToAll'))
);

-- Indexes for better performance
CREATE INDEX idx_services_user ON services("user_id");
CREATE INDEX idx_services_category ON services("category_id");
CREATE INDEX idx_services_status ON services("status");

-- Images Table (for both items and services)
CREATE TABLE images (
    "id" SERIAL PRIMARY KEY,
    "entity_type" VARCHAR(10) NOT NULL CHECK ("entity_type" IN ('item', 'service')),
    "entity_id" INTEGER NOT NULL,
    "url" VARCHAR(255) NOT NULL,
    "is_main" BOOLEAN DEFAULT FALSE,
    "uploaded_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" INTEGER REFERENCES "user"("id")
);

-- Index for faster entity lookups
CREATE INDEX idx_images_entity ON images("entity_type", "entity_id");

-- Trade Offers Table
CREATE TABLE trade_offers (
    "id" SERIAL PRIMARY KEY,
    "offerer_id" INTEGER NOT NULL REFERENCES "user"("id"),
    "receiver_id" INTEGER NOT NULL REFERENCES "user"("id"),
    "offered_entity_type" VARCHAR(10) NOT NULL CHECK ("offered_entity_type" IN ('item', 'service')),
    "offered_entity_id" INTEGER NOT NULL,
    "requested_entity_type" VARCHAR(10) NOT NULL CHECK ("requested_entity_type" IN ('item', 'service')),
    "requested_entity_id" INTEGER NOT NULL,
    "status" VARCHAR(20) DEFAULT 'pending' CHECK ("status" IN ('pending', 'accepted', 'rejected', 'cancelled')),
    "message" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "cash_offer" DECIMAL(10,2) DEFAULT 0,
    "cash_requested" DECIMAL(10,2) DEFAULT 0
);

-- Indexes for better performance
CREATE INDEX idx_trade_offers_offerer ON trade_offers("offerer_id");
CREATE INDEX idx_trade_offers_receiver ON trade_offers("receiver_id");

-- Reviews Table (for both users and items/services)
CREATE TABLE reviews (
    "id" SERIAL PRIMARY KEY,
    "reviewer_id" INTEGER NOT NULL REFERENCES "user"("id"),
    "reviewed_user_id" INTEGER REFERENCES "user"("id"),
    "reviewed_entity_type" VARCHAR(10) CHECK ("reviewed_entity_type" IN ('item', 'service')),
    "reviewed_entity_id" INTEGER,
    "rating" INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
    "comment" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_review_target CHECK (
        ("reviewed_user_id" IS NOT NULL) OR 
        ("reviewed_entity_type" IS NOT NULL AND "reviewed_entity_id" IS NOT NULL)
    )
);

-- Indexes for better performance
CREATE INDEX idx_reviews_reviewer ON reviews("reviewer_id");
CREATE INDEX idx_reviews_reviewed_user ON reviews("reviewed_user_id");
CREATE INDEX idx_reviews_entity ON reviews("reviewed_entity_type", "reviewed_entity_id");


-- Favorites Table
CREATE TABLE favorites (
    "user_id" INTEGER NOT NULL REFERENCES "user"("id"),
    "entity_type" VARCHAR(10) NOT NULL CHECK ("entity_type" IN ('item', 'service')),
    "entity_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("user_id", "entity_type", "entity_id")
);

-- Index for faster user favorites lookup
CREATE INDEX idx_favorites_user ON favorites("user_id");


-- advertisment table 
CREATE TABLE advertisements (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    product_description TEXT NOT NULL,
    product_image BYTEA,  -- For storing the image as binary
    approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
