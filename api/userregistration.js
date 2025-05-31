const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const cors = require("cors");
const multer = require("multer");
require("dotenv").config();
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const requestIp = require('request-ip');
import { z } from "zod";
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const streamifier = require('streamifier'); // Import streamifier

const app = express();
const PORT = process.env.PORT || 3000;

console.log("Connecting to database with URL:", process.env.DATABASE_URL);

// Configure nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Your Gmail address
        pass: 'heen oxfi tpuq vezd'   // Your app password
    }
});

// PostgreSQL connection setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
    max: 10, // Adjust according to your needs
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Middleware
// app.use(cors());

  // Change this:


// To this:
app.use(cors());

// app.use(cors({
//     origin: ['http://localhost:3000', 'http://localhost:3001', 'https://liwedoc.vercel.app'],
//     methods: ['GET', 'POST', 'PUT', 'DELETE'],
//     credentials: true
// }));
app.use(bodyParser.json());
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Test database connection
pool.connect()
    .then(client => {
        console.log("Connected to the database.");
        client.release();
    })
    .catch(err => {
        console.error("Database connection error:", err);
    });

// GET route to retrieve all users
app.get("/users", async (req, res) => {
    try {
        const users = await pool.query("SELECT * FROM \"user\" WHERE \"Deletedat\" IS NULL");
        res.status(200).json(users.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


// get by id 
// get by id 

// GET route to retrieve a user by ID
app.get("/users/:id", async (req, res) => {
    const userId = req.params.id;

    try {
        const user = await pool.query("SELECT * FROM \"user\" WHERE \"id\" = $1 AND \"Deletedat\" IS NULL", [userId]);

        if (user.rows.length === 0) {
            return res.status(404).json({ error: "User not found." });
        }

        res.status(200).json(user.rows[0]);
    } catch (err) {
        console.error("Error retrieving user:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
// POST route to create a new user
app.post("/users", async (req, res) => {
    const { Firstname, Lastname, Email, Password , Role } = req.body;
    const userRole = Role || "User";
    if (!Firstname || !Lastname || !Email || !Password) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        const userCheck = await pool.query("SELECT * FROM \"user\" WHERE \"Email\" = $1", [Email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: "User  already exists." });
        }

        const hashedPassword = await bcrypt.hash(Password, 10);
        const newUser = await pool.query(
            "INSERT INTO \"user\" (\"Firstname\", \"Lastname\", \"Email\", \"Password\",\"Role\", \"Createdat\" ) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *",
            [Firstname, Lastname, Email, hashedPassword ,userRole]
        );

        console.log("New user created:", newUser.rows[0]); // Logging the created user

        if (!newUser.rows[0].id) {
            return res.status(500).json({ error: "User  creation failed, ID not found." });
        }

        // Generate an activation token
        const token = crypto.randomBytes(20).toString('hex');

        // Store the token in ActivationToken table using the correct key
        await pool.query(
            "INSERT INTO \"ActivationToken\" (\"id\", \"Token\", \"Createdat\", \"Expiredat\") VALUES ($1, $2, NOW(), NOW() + interval '1 hour')",
            [newUser.rows[0].id, token]  // Use 'id' here
        );

        // Create the activation link using your production URL
        // const activationLink = `https://liwedoc.vercel.app/${token}`;
        const activationLink = `https://liwedoc.vercel.app/activate/${token}`;
        // const baseUrl = process.env.NODE_ENV === 'production' 
        //     ? 'https://liwedoc.vercel.app'
        //     : 'http://localhost:3000';
            
        // const activationLink = `${baseUrl}/activate/${token}`;


        // Send activation email
        await transporter.sendMail({
            to: Email,
            subject: "Account Activation",
            text: `Please activate your account by clicking the following link: ${activationLink}`
        });

        return res.status(201).json({ message: "User  created. Please check your email to activate your account." });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

/// Image uplode api
app.post("/users/image", upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No image provided." });
    }

    const email = req.body.Email;

    try {
        // Check if the user exists based on Email
        const userCheck = await pool.query("SELECT * FROM \"user\" WHERE \"Email\" = $1", [email]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: "User not found." });
        }

        // Update the user's image
        const imageData = req.file.buffer;
        const updatedUser = await pool.query(
            "UPDATE \"user\" SET \"Image\" = $1 WHERE \"Email\" = $2 RETURNING *",
            [imageData, email]
        );

        return res.status(200).json(updatedUser.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

// activation api 

app.get("/activate/:token", async (req, res) => {
    const token = req.params.token;
    
    // Add debug logs
    console.log("Request params:", req.params);
    console.log("Activation token received:", token);
    
    if (!token || token === 'undefined') {
        console.error("Token is missing or undefined");
        return res.status(400).json({ error: "Invalid activation link. Token is missing." });
    }
    
    try {
        // Check if the token is valid
        const result = await pool.query("SELECT * FROM \"ActivationToken\" WHERE \"Token\" = $1 AND \"Expiredat\" > NOW()", [token]);

        if (result.rows.length === 0) {
            console.error("Invalid or expired token.");
            return res.status(400).json({ error: "Invalid or expired token." });
        }

        const userId = result.rows[0].id;
        console.log("User ID retrieved for activation:", userId);

        // Attempt to update the user
        const updateResult = await pool.query("UPDATE \"user\" SET \"activated\" = true WHERE \"id\" = $1", [userId]);
        console.log("Update result row count:", updateResult.rowCount);

        await pool.query("DELETE FROM \"ActivationToken\" WHERE \"Token\" = $1", [token]);

        // If this is a direct API access, redirect to a success page
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return res.redirect('http://localhost:3000/login?activated=true');
        }
        
        // Otherwise return JSON
        return res.status(200).json({ message: "Your account has been activated. You can now log in." });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});


app.delete("/users/:id", async (req, res) => {
    const userId = req.params.id;

    try {
        // Check if the user exists
        const userCheck = await pool.query("SELECT * FROM \"user\" WHERE \"id\" = $1", [userId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: "User not found." });
        }

        // Permanently delete the user
        const deleteUser = await pool.query(
            "DELETE FROM \"user\" WHERE \"id\" = $1 RETURNING *",
            [userId]
        );

        if (deleteUser.rowCount === 0) {
            return res.status(500).json({ error: "Failed to delete user." });
        }

        return res.status(200).json({ message: "User deleted successfully.", user: deleteUser.rows[0] });
    } catch (err) {
        console.error("Error deleting user:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});










app.get("/charities", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM charities WHERE deleted_at IS NULL");

        // Convert image buffer to Base64 string
        const charities = result.rows.map(charity => {
            if (charity.image) { // Check if image exists
                charity.image = `data:image/jpeg;base64,${charity.image.toString('base64')}`;
            }
            return charity;
        });

        res.status(200).json(charities);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// GET route to retrieve a charity by ID
app.get("/charities/:id", async (req, res) => {
    const charityId = req.params.id;

    try {
        const result = await pool.query("SELECT * FROM charities WHERE id = $1 AND deleted_at IS NULL", [charityId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Charity not found." });
        }

        const charity = result.rows[0];

        // Convert image buffer to Base64 string if it exists
        if (charity.image) {
            charity.image = `data:image/jpeg;base64,${charity.image.toString('base64')}`;
        }

        res.status(200).json(charity);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


// POST route to create a new charity
app.post("/charities",upload.single('image'), async (req, res) => {
    const { name, description, goal, location, needed } = req.body;
    const image = req.file.buffer;


    if (!name || !description || !goal || !location) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        const result = await pool.query(
            "INSERT INTO charities (name, description, image, goal, location, needed, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *",
            [name, description, image, goal, location, JSON.stringify(needed)]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// PUT route to update a charity
app.put("/charities/:id", async (req, res) => {
    const charityId = req.params.id;
    const { name, description, image, goal, location, needed } = req.body;

    try {
        const result = await pool.query(
            "UPDATE charities SET name = $1, description = $2, image = $3, goal = $4, location = $5, needed = $6 WHERE id = $7 RETURNING *",
            [name, description, image, goal, location, JSON.stringify(needed), charityId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Charity not found." });
        }

        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


app.delete("/charities/:id", async (req, res) => {
    const charityId = req.params.id;

    try {
        const result = await pool.query(
            "DELETE FROM charities WHERE id = $1 RETURNING *",
            [charityId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Charity not found." });
        }

        res.status(200).json({ message: "Charity deleted successfully." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
// Create an advertisement
// Retrieve a single advertisement by ID
app.get("/advertisements/:id", async (req, res) => {
    const adId = req.params.id;

    try {
        const result = await pool.query(
            "SELECT * FROM advertisements WHERE id = $1",
            [adId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Advertisement not found." });
        }
        const advertisement = result.rows[0];

        // Convert image buffer to Base64 string if it exists
        if (advertisement.product_image) {
            advertisement.product_image = `data:image/jpeg;base64,${advertisement.product_image.toString('base64')}`;
        }
        

        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post("/advertisements", upload.single('product_image'), async (req, res) => {
    const { company_name, email, phone_number, product_description } = req.body;

    // Check if the file exists
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
    }

    // Validate required fields
    if (!company_name || !email || !phone_number || !product_description) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    const product_image = req.file.buffer; // Use req.file.buffer directly

    try {
        const result = await pool.query(
            "INSERT INTO advertisements (company_name, email, phone_number, product_description, product_image) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [company_name, email, phone_number, product_description, product_image]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Approve an advertisement
// Approve an advertisement with payment information
app.patch("/advertisements/:id/approve", async (req, res) => {
    const adId = req.params.id;
    const { payment_amount, payment_duration } = req.body;
  
    // Validate payment information
    if (!payment_amount || !payment_duration) {
      return res.status(400).json({ error: "Payment amount and duration are required." });
    }
  
    try {
      // Calculate expiration date based on duration
      const expirationDate = new Date();
  
      switch (payment_duration) {
        case "1week":
          expirationDate.setDate(expirationDate.getDate() + 7);
          break;
        case "2weeks":
          expirationDate.setDate(expirationDate.getDate() + 14);
          break;
        case "1month":
          expirationDate.setMonth(expirationDate.getMonth() + 1);
          break;
        case "3months":
          expirationDate.setMonth(expirationDate.getMonth() + 3);
          break;
        case "6months":
          expirationDate.setMonth(expirationDate.getMonth() + 6);
          break;
        case "1year":
          expirationDate.setFullYear(expirationDate.getFullYear() + 1);
          break;
        default:
          expirationDate.setDate(expirationDate.getDate() + 7); // Default to 1 week
      }
  
      const result = await pool.query(
        `UPDATE advertisements 
         SET approved = TRUE, 
             payment_amount = $1, 
             payment_duration = $2, 
             expiration_date = $3 
         WHERE id = $4 
         RETURNING *`,
        [payment_amount, payment_duration, expirationDate, adId]
      );
  
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Advertisement not found." });
      }
  
      res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

// Retrieve all advertisements
app.get("/advertisements", async (req, res) => {
    try {
      const result = await pool.query("SELECT * FROM advertisements");
      const advertisements = result.rows.map(advertisement => {
        // Convert image buffer to Base64 string if it exists
        if (advertisement.product_image) {
          advertisement.product_image = `data:image/jpeg;base64,${advertisement.product_image.toString('base64')}`;
        }
        return advertisement;
      });
      res.status(200).json(advertisements);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
// Retrieve approved advertisements
// Retrieve approved advertisements
app.get("/advertisements/approved", async (req, res) => {
    try {
      // Only return advertisements that are approved and not expired
      const result = await pool.query(`
        SELECT * FROM advertisements 
        WHERE approved = true 
        AND (expiration_date IS NULL OR expiration_date > NOW())
      `);
  
      const advertisements = result.rows.map(advertisement => {
        // Convert image buffer to Base64 string if it exists
        if (advertisement.product_image) {
          advertisement.product_image = `data:image/jpeg;base64,${advertisement.product_image.toString('base64')}`;
        }
        return advertisement;
      });
  
      res.status(200).json(advertisements);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

// Delete an advertisement
app.delete("/advertisements/:id", async (req, res) => {
    const adId = req.params.id;

    try {
        const result = await pool.query(
            "DELETE FROM advertisements WHERE id = $1 RETURNING *",
            [adId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Advertisement not found." });
        }

        res.status(200).json({ message: "Advertisement deleted successfully." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const cron = require('node-cron');

// Setup cron job to automatically delete expired advertisements
// This runs every day at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    console.log("Running scheduled task to remove expired advertisements");
    const result = await pool.query(
      "DELETE FROM advertisements WHERE expiration_date < NOW() AND expiration_date IS NOT NULL RETURNING id"
    );

    if (result.rows.length > 0) {
      console.log(`Removed ${result.rows.length} expired advertisements`);
    }
  } catch (err) {
    console.error("Error removing expired advertisements:", err);
  }
});



// Middleware to track visitor IP addresses
const trackVisitor = async (req, res, next) => {
    // Use request-ip to get the client's IP address
    const clientIp = requestIp.getClientIp(req);

    if (!clientIp) {
        console.warn("Could not determine client IP address.");
        return next(); // Continue without tracking if IP can't be determined
    }

    try {
        // Store the IP address in the database
        await pool.query(
            'INSERT INTO visitors (ip_address, visit_time) VALUES ($1, NOW())',
            [clientIp]
        );
        next(); // Continue to the next middleware or route handler
    } catch (err) {
        console.error('Error tracking visitor:', err);
        next(err); // Pass the error to the error handler
    }
};

app.use(trackVisitor); // Apply the middleware to all routes

// API Endpoint to get the list of visitors
app.get('/visitors', async (req, res) => {
    try {
        const result = await pool.query('SELECT ip_address, visit_time FROM visitors ORDER BY visit_time DESC');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error getting visitors:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



const itemSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters."),
  description: z.string().optional(),
  category: z.string().min(1, "Please select a category."),
  subcategory: z.string().min(1, "Please select a subcategory."),
  condition: z.string().min(1, "Please select a condition."),
  price: z.number().min(0, "Price must be a positive number."),
  city: z.string().min(1, "Please enter your city."),
  subcity: z.string().optional(),
  phone: z.string().min(10, "Please enter a valid phone number."),
  email: z.string().email("Please enter a valid email address."),
  preferredContactMethod: z.enum(["phone", "email"], {
    required_error: "Please select a preferred contact method.",
  }),
  image_urls: z.array(z.string()).optional(), // Add this to accept image URLs
  user_id: z.number().int().positive(), // Add user_id validation
});
app.post("/api/items", async (req, res) => {
  try {
    const validatedData = itemSchema.parse(req.body); // Validate incoming data

    const {
      title,
      description,
      category,
      subcategory,
      condition,
      price,
      city,
      subcity,
      phone,
      email,
      preferredContactMethod,
      image_urls = [],
      user_id, // <-- Add user_id here
    } = validatedData;

    // Insert item into the database with user_id
    const result = await pool.query(
      `
      INSERT INTO item (
        title, description, category, subcategory, condition, 
        price, city, subcity, phone, email, 
        preferred_contact_method, image_urls, user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
      `,
      [
        title,
        description,
        category,
        subcategory,
        condition,
        price,
        city,
        subcity,
        phone,
        email,
        preferredContactMethod,
        image_urls,
        user_id, // <-- Include user_id in values array
      ]
    );

    const newItemId = result.rows[0].id;

    return res.status(201).json({
      success: true,
      message: "Item created successfully",
      itemId: newItemId,
    });
  } catch (error) {
    console.error("Error creating item:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to create item",
    });
  }
});


// Get item by ID endpointu
app.get("/api/items/:id", async (req, res) => {
  const itemId = req.params.id;

  try {
    const result = await pool.query(
      `
      SELECT * FROM item WHERE id = $1
      `,
      [itemId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    const item = result.rows[0];
    return res.status(200).json({
      success: true,
      item,
    });
  } catch (error) {
    console.error("Error fetching item:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch item",
    });
  }
});

// Fetch all items endpoint
app.get("/items", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM item WHERE status != 'swapped' ORDER BY createdat DESC"
    );
    return res.status(200).json({
      success: true,
      items: result.rows,
    });
  } catch (error) {
    console.error("Error fetching items:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch items",
    });
  }
});

cloudinary.config({
  cloud_name: process.env.CLOUDERY_API_NAME, // Replace with your Cloudinary cloud name
  api_key: process.env.CLOUDERY_API_KEY,       // Replace with your Cloudinary API key
  api_secret: process.env.CLOUDERY_API_SECRET,  // Replace with your Cloudinary API secret
});

// Set up multer for file uploads using memory storage
const memoryStorage = multer.memoryStorage();
const imageUpload = multer({ storage: memoryStorage });

// Upload images endpoint
app.post('/api/upload', imageUpload.array('image_urls'), async (req, res) => {
  try {
    const uploadPromises = req.files.map((file) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream((error, result) => {
          if (error) {
            console.error("Cloudinary upload error:", error);
            return reject("Failed to upload image");
          }
          resolve(result.secure_url); // Return the secure URL
        });

        // Pipe the file buffer to Cloudinary upload stream
        streamifier.createReadStream(file.buffer).pipe(stream);
      });
    });

    // Wait for all uploads to complete
    const imageUrls = await Promise.all(uploadPromises);
    return res.status(200).json({ success: true, urls: imageUrls });
  } catch (error) {
    console.error("Unexpected error uploading to Cloudinary:", error);
    return res.status(500).json({ success: false, message: "Failed to upload images" });
  }
});


// get user listing from item table by using user id 
app.get("/allpostitem/:userId", async (req, res) => {
  const user_id = req.params.userId;
    // const charityId = req.params.id;

  try {
    const result = await pool.query(
      'SELECT * FROM item WHERE user_id = $1 ORDER BY createdat DESC',
      [user_id]
    );
    if (result.rows.length === 0) {
            return res.status(404).json({ error: "Charity not found." });
        }
    return res.status(200).json({ success: true, items: result.rows });
  } catch (error) {
    console.error('Error fetching user items:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch items' });
  }
});

app.get("/postitem/:userId", async (req, res) => {
  const user_id = req.params.userId;
    // const charityId = req.params.id;

  try {
    const result = await pool.query(
      "SELECT * FROM item WHERE user_id = $1 AND status != 'swapped' ORDER BY createdat DESC",
      [user_id]
    );
    if (result.rows.length === 0) {
            return res.status(404).json({ error: "item not found." });
        }
    return res.status(200).json({ success: true, items: result.rows });
  } catch (error) {
    console.error('Error fetching user items:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch items' });
  }
});
app.get("/swappeditem/:userId", async (req, res) => {
  const user_id = req.params.userId;
    // const charityId = req.params.id;

  try {
    const result = await pool.query(
      "SELECT * FROM item WHERE user_id = $1 AND status = 'swapped' ORDER BY createdat DESC",
      [user_id]
    );
    if (result.rows.length === 0) {
            return res.status(404).json({ error: "item not found." });
        }
    return res.status(200).json({ success: true, items: result.rows });
  } catch (error) {
    console.error('Error fetching user items:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch items' });
  }
});
/// service api 

const serviceSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters."),
  description: z.string().optional(),
  category: z.string().min(1, "Please select a category."),
  subcategory: z.string().min(1, "Please select a subcategory."),
  // condition: z.string().min(1, "Please select a condition."),
  price: z.number().min(0, "Price must be a positive number."),
  city: z.string().min(1, "Please enter your city."),
  subcity: z.string().optional(),
  phone: z.string().min(10, "Please enter a valid phone number."),
  email: z.string().email("Please enter a valid email address."),
  preferredContactMethod: z.enum(["phone", "email"], {
    required_error: "Please select a preferred contact method.",
  }),
  image_urls: z.array(z.string()).optional(), // Add this to accept image URLs
  user_id: z.number().int().positive(), // Add user_id validation
});

// post api for seervice 
app.post("/api/services", async (req, res) => {
  try {
    const validatedData = serviceSchema.parse(req.body); // Validate incoming data

    const {
      title,
      description,
      category,
      subcategory,
      // condition,
      price,
      city,
      subcity,
      phone,
      email,
      preferredContactMethod,
      image_urls = [],
      user_id, // <-- Add user_id here
    } = validatedData;

    // Insert item into the database with user_id
    const result = await pool.query(
  `
  INSERT INTO service (
    title, description, category, subcategory, 
    price, city, subcity, phone, email, 
    preferred_contact_method, image_urls, user_id
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  RETURNING id
  `,
  [
    title,
    description,
    category,
    subcategory,
    price,
    city,
    subcity,
    phone, // Ensure this matches the database column
    email,
    preferredContactMethod,
    image_urls,
    user_id,
  ]
);

    const newServiceId = result.rows[0].id;

    return res.status(201).json({
      success: true,
      message: "Item created successfully",
      serviceId: newServiceId,
    });
  } catch (error) {
    console.error("Error creating item:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to create item",
    });
  }
});
// Get item by ID endpointu
app.get("/api/services/:id", async (req, res) => {
  const ServiceId = req.params.id;

  try {
    const result = await pool.query(
      `
      SELECT * FROM service WHERE id = $1
      `,
      [ServiceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }
//
    const service = result.rows[0];
    return res.status(200).json({
      success: true,
      service,
    });
  } catch (error) {
    console.error("Error fetching item:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch item",
    });
  }
});

// Fetch all items endpoint
app.get("/services", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM service ORDER BY createdat DESC");
    return res.status(200).json({
      success: true,
      service: result.rows,
    });
  } catch (error) {
    console.error("Error fetching items:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch items",
    });
  }
});

//   cloud_name: process.env.CLOUDERY_API_NAME, // Replace with your Cloudinary cloud name
//   api_key: process.env.CLOUDERY_API_KEY,       // Replace with your Cloudinary API key
//   api_secret: process.env.CLOUDERY_API_SECRET,  // Replace with your Cloudinary API secret
// });

// // Set up multer for file uploads using memory storage
// const memoryStorage = multer.memoryStorage();
// const imageUpload = multer({ storage: memoryStorage });

// Upload images endpoint
app.post('/api/uploads', imageUpload.array('image_urls'), async (req, res) => {
  try {
    const uploadPromises = req.files.map((file) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream((error, result) => {
          if (error) {
            console.error("Cloudinary upload error:", error);
            return reject("Failed to upload image");
          }
          resolve(result.secure_url); // Return the secure URL
        });

        // Pipe the file buffer to Cloudinary upload stream
        streamifier.createReadStream(file.buffer).pipe(stream);
      });
    });

    // Wait for all uploads to complete
    const imageUrls = await Promise.all(uploadPromises);
    return res.status(200).json({ success: true, urls: imageUrls });
  } catch (error) {
    console.error("Unexpected error uploading to Cloudinary:", error);
    return res.status(500).json({ success: false, message: "Failed to upload images" });
  }
});


// get user listing from item table by using user id 
app.get("/postservice/:userId", async (req, res) => {
  const user_id = req.params.userId;
    // const charityId = req.params.id;

  try {
    const result = await pool.query(
      'SELECT * FROM service WHERE user_id = $1 ORDER BY createdat DESC',
      [user_id]
    );
    if (result.rows.length === 0) {
            return res.status(404).json({ error: "Charity not found." });
        }
    return res.status(200).json({ success: true, services: result.rows });
  } catch (error) {
    console.error('Error fetching user items:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch items' });
  }
});

 app.get("/services", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM service ORDER BY createdat DESC");
    return res.status(200).json({
      success: true,
      service: result.rows,
    });
  } catch (error) {
    console.error("Error fetching items:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch items",
    });
  }
});

// app.post('/api/swap-request', async (req, res) => {
//     const { userId, itemId, offeredItemId } = req.body;

//     if (!userId || !itemId || !offeredItemId) {
//         return res.status(400).json({ success: false, message: 'Missing required fields' });
//     }

//     try {
//         // Insert new swap request
//         const newRequest = await pool.query(
//             `INSERT INTO swap_requests (user_id, item_id, offered_item_id) 
//              VALUES ($1, $2, $3) 
//              RETURNING id`,
//             [userId, itemId, offeredItemId]
//         );

//         // Fetch item details including owner's email
//         const itemResult = await pool.query(
//             `SELECT title, email, user_id FROM item WHERE id = $1`,
//             [itemId]
//         );

//         // Fetch offered item title
//         const offeredItemResult = await pool.query(
//             `SELECT title FROM item WHERE id = $1`,
//             [offeredItemId]
//         );

//         // Fetch requesting user's name
//         const userResult = await pool.query(
//             `SELECT "Firstname", "Lastname" FROM "user" WHERE id = $1`,
//             [userId]
//         );

//         if (
//             itemResult.rows.length > 0 &&
//             userResult.rows.length > 0 &&
//             offeredItemResult.rows.length > 0
//         ) {
//             const itemTitle = itemResult.rows[0].title;
//             const offeredItemTitle = offeredItemResult.rows[0].title;
//             const userName = `${userResult.rows[0].Firstname} ${userResult.rows[0].Lastname}`;
//             const ownerEmail = itemResult.rows[0].email;
//             const productLink = `http://localhost:3000/products/${itemId}`; // Change domain as needed

//             // Compose message with both item titles
//             const message = `${userName} is interested in swapping "${itemTitle}" for your item "${offeredItemTitle}"`;

//             // Insert notification for the owner with product link
//             await pool.query(
//                 `INSERT INTO notifications (user_id, message, created_at, item_id, offered_item_id, product_link) 
//                  VALUES ($1, $2, NOW(), $3, $4, $5)`,
//                 [
//                     itemResult.rows[0].user_id,
//                     message,
//                     itemId,
//                     offeredItemId,
//                     productLink
//                 ]
//             );

//             // Send email notification with product link and message
//             await transporter.sendMail({
//                 from: process.env.EMAIL_USER,
//                 to: ownerEmail,
//                 subject: 'New Swap Request',
//                 text: `${message}. View the product here: ${productLink}`,
//                 html: `
//                     <p>${message}.</p>
//                     <p>View the product: <a href="${productLink}">${productLink}</a></p>
//                 `
//             });
//         }

//         return res.status(201).json({ success: true, requestId: newRequest.rows[0].id });
//     } catch (error) {
//         console.error('Error saving swap request:', error);
//         return res.status(500).json({ success: false, message: 'Internal Server Error' });
//     }
// });

app.post('/api/swap-request', async (req, res) => {
  const {
    userId,
    requestedId,
    requestedType,
    offeredId,
    offeredType,
    isMoneyOffer = false,
    moneyAmount = null,
  } = req.body;

  // Basic validation
  if (!userId || !requestedId || !requestedType || !['item', 'service'].includes(requestedType)) {
    return res.status(400).json({ success: false, message: 'Missing or invalid required fields' });
  }

  if (isMoneyOffer) {
    if (moneyAmount == null || isNaN(moneyAmount) || moneyAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid money amount' });
    }
  } else {
    if (!offeredId || !offeredType || !['item', 'service'].includes(offeredType)) {
      return res.status(400).json({ success: false, message: 'Missing or invalid offered item/service' });
    }
  }

  try {
    // Insert swap request with money offer option
    const insertQuery = `
      INSERT INTO swap_request
      (user_id, requested_id, requested_type, offered_id, offered_type, is_money_offer, money_amount)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    const insertValues = [
      userId,
      requestedId,
      requestedType,
      isMoneyOffer ? null : offeredId,
      isMoneyOffer ? null : offeredType,
      isMoneyOffer,
      isMoneyOffer ? moneyAmount : null,
    ];

    const newRequest = await pool.query(insertQuery, insertValues);

    // Fetch requested entity details
    const fetchEntity = async (type, id) => {
      if (type === 'item') {
        const res = await pool.query(`SELECT title, email, user_id FROM item WHERE id = $1`, [id]);
        return res.rows[0];
      } else {
        const res = await pool.query(`SELECT title, email, user_id FROM service WHERE id = $1`, [id]);
        return res.rows[0];
      }
    };

    const requestedEntity = await fetchEntity(requestedType, requestedId);
    if (!requestedEntity) {
      return res.status(404).json({ success: false, message: `Requested ${requestedType} not found` });
    }

    // Fetch requesting user's name
    const userResult = await pool.query(
      `SELECT "Firstname", "Lastname" FROM "user" WHERE id = $1`,
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Requesting user not found' });
    }
    const userName = `${userResult.rows[0].Firstname} ${userResult.rows[0].Lastname}`;

    // Compose product link for requested entity
    const productLink =
      requestedType === 'item'
        ? `http://localhost:3000/products/${requestedId}`
        : `http://localhost:3000/services/${requestedId}`;

    // Compose notification message
    let message;
    if (isMoneyOffer) {
      message = `${userName} is interested in buying your ${requestedType} "${requestedEntity.title}" for $${moneyAmount.toFixed(2)}.`;
    } else {
      // Fetch offered entity title
      const offeredEntity = await fetchEntity(offeredType, offeredId);
      if (!offeredEntity) {
        return res.status(404).json({ success: false, message: `Offered ${offeredType} not found` });
      }
      message = `${userName} is interested in swapping their ${offeredType} "${offeredEntity.title}" for your ${requestedType} "${requestedEntity.title}".`;
    }

    // Insert notification
    await pool.query(
      `INSERT INTO notification (user_id, message, created_at, requested_id, requested_type, offered_id, offered_type, is_money_offer, money_amount, product_link)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9)`,
      [
        requestedEntity.user_id,
        message,
        requestedId,
        requestedType,
        isMoneyOffer ? null : offeredId,
        isMoneyOffer ? null : offeredType,
        isMoneyOffer,
        isMoneyOffer ? moneyAmount : null,
        productLink,
      ]
    );

    // Send email notification
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: requestedEntity.email,
      subject: 'New Swap Request',
      text: `${message} View it here: ${productLink}`,
      html: `<p>${message}</p><p>View it here: <a href="${productLink}">${productLink}</a></p>`,
    });

    return res.status(201).json({ success: true, requestId: newRequest.rows[0].id });
  } catch (error) {
    console.error('Error saving swap request:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});





// GET route to fetch all swap requests
// app.get('/api/swap-requests', async (req, res) => {
//     try {
//         const result = await pool.query(`SELECT * FROM swap_requests`);
//         return res.status(200).json({ success: true, requests: result.rows });
//     } catch (error) {
//         console.error('Error fetching swap requests:', error);
//         return res.status(500).json({ success: false, message: 'Internal Server Error' });
//     }
// });

// // GET route to fetch swap requests for a specific user
// app.post('/api/swap-requests/accept/:notificationId', async (req, res) => {
//     const notificationId = req.params.notificationId;

//     try {
//         // Fetch the item IDs associated with the notification
//         const notif = await pool.query(
//             `SELECT item_id, offered_item_id FROM notifications WHERE id = $1`,
//             [notificationId]
//         );

//         if (notif.rows.length === 0) {
//             return res.status(404).json({ success: false, message: 'Notification not found' });
//         }

//         const { item_id, offered_item_id } = notif.rows[0];

//         // Fetch the email of the user who owns the item
//         const itemOwnerEmail = await pool.query(
//             `SELECT "email" FROM "item" WHERE id = $1`,
//             [item_id]
//         );

//         if (itemOwnerEmail.rows.length === 0) {
//             return res.status(404).json({ success: false, message: 'Item owner not found' });
//         }

//         const Email = itemOwnerEmail.rows[0].email;

//         // Update item statuses to 'swapped'
//         await pool.query(
//             `UPDATE item SET status = 'swapped' WHERE id = $1 OR id = $2`,
//             [item_id, offered_item_id]
//         );

//         // Update the notification as accepted
//         await pool.query(
//             `UPDATE notifications SET accepted = true WHERE id = $1`,
//             [notificationId]
//         );

//         // Send email notification
//         await transporter.sendMail({
//             from: process.env.EMAIL_USER, // Sender address
//             to: Email,                     // List of recipients
//             subject: 'Swap Request Accepted', // Subject line
//             text: 'Your swap request has been accepted!', // Plain text body
//         });

//         return res.status(200).json({ success: true, message: 'Items accepted and status updated' });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ success: false, message: 'Internal Server Error' });
//     }
// });

// // POST route to reject a swap request
// app.post('/api/swap-requests/reject/:requestId', async (req, res) => {
//     const requestId = req.params.requestId;

//     try {
//         await pool.query(
//             `DELETE FROM swap_requests WHERE id = $1`,
//             [requestId]
//         );

//         return res.status(200).json({ success: true, message: 'Swap request rejected' });
//     } catch (error) {
//         console.error('Error rejecting swap request:', error);
//         return res.status(500).json({ success: false, message: 'Internal Server Error' });
//     }
// });

// // GET route to fetch notifications for a specific user
// app.get('/api/notifications/:userId', async (req, res) => {
//     const userId = req.params.userId;

//     try {
//         const result = await pool.query(
//             `SELECT * FROM notifications WHERE user_id = $1 AND accepted = false ORDER BY created_at DESC`,
//             [userId]
//         );

//         if (result.rows.length === 0) {
//             return res.status(404).json({ success: false, message: 'No notifications found for this user.' });
//         }

//         return res.status(200).json({ success: true, notifications: result.rows });
//     } catch (error) {
//         console.error('Error fetching notifications:', error);
//         return res.status(500).json({ success: false, message: 'Internal Server Error' });
//     }
// });
// /////// 
// // Accept swap by notification ID
// app.post('/api/notifications/accept/:notificationId', async (req, res) => {
//   const notificationId = req.params.notificationId;

//   try {
//     // Fetch the item IDs associated with the notification
//     const notif = await pool.query(
//       `SELECT item_id, offered_item_id FROM notifications WHERE id = $1`,
//       [notificationId]
//     );

//     if (notif.rows.length === 0) {
//       return res.status(404).json({ success: false, message: 'Notification not found' });
//     }

//     const { item_id, offered_item_id } = notif.rows[0];

//     // Update item statuses to 'swapped'
//     await pool.query(
//       `UPDATE item SET status = 'swapped' WHERE id = $1 OR id = $2`,
//       [item_id, offered_item_id]
//     );

//     // Log before updating notifications
//     console.log("Updating notification as accepted:", notificationId);
    
//     // Update the notification as accepted
//     const updateResult = await pool.query(
//       `UPDATE notifications SET accepted = true WHERE id = $1`,
//       [notificationId]
//     );

//     // Check if update was successful
//     if (updateResult.rowCount === 0) {
//       console.warn("No rows updated for notification:", notificationId);
//     } else {
//       console.log("Notification updated successfully:", notificationId);
//     }

//     return res.status(200).json({ success: true, message: 'Items accepted and status updated' });
//   } catch (error) {
//     console.error("Error in accept notification:", error);
//     return res.status(500).json({ success: false, message: 'Internal Server Error' });
//   }
// });
// // Reject swap by notification ID
// app.post('/api/notifications/reject/:notificationId', async (req, res) => {
//   const notificationId = req.params.notificationId;

//   try {
//     const notif = await pool.query(
//       `SELECT item_id, offered_item_id FROM notifications WHERE id = $1`,
//       [notificationId]
//     );

//     if (notif.rows.length === 0) {
//       return res.status(404).json({ success: false, message: 'Notification not found' });
//     }

//     const { item_id, offered_item_id } = notif.rows[0];

//     await pool.query(
//       `UPDATE item SET status = 'draft' WHERE id = $1 OR id = $2`,
//       [item_id, offered_item_id]
//     );

//     // Optionally delete swap_requests and notification entries here

//     return res.status(200).json({ success: true, message: 'Items rejected and status updated' });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ success: false, message: 'Internal Server Error' });
//   }
// });
// GET all swap requests
// GET all swap requests
app.get('/api/swap-requests', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM swap_request`);
    return res.status(200).json({ success: true, requests: result.rows });
  } catch (error) {
    console.error('Error fetching swap requests:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// POST accept swap request by notification ID
app.post('/api/swap-requests/accept/:notificationId', async (req, res) => {
  const notificationId = req.params.notificationId;

  try {
    // Fetch notification details including money offer info and requested user id
    const notifResult = await pool.query(
      `SELECT requested_id, requested_type, offered_id, offered_type, is_money_offer, user_id AS requester_user_id FROM notification WHERE id = $1`,
      [notificationId]
    );

    if (notifResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    const {
      requested_id,
      requested_type,
      offered_id,
      offered_type,
      is_money_offer,
      requester_user_id,
    } = notifResult.rows[0];

    // Fetch the accepting user's ID from the request (assuming auth middleware sets req.user)
    // If not, you can pass it in the request body or headers
    const acceptingUserId = req.user?.id;
    if (!acceptingUserId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: accepting user not found' });
    }

    // If it's NOT a money offer, update item/service statuses
    if (!is_money_offer) {
      const updateStatus = async (type, id, status) => {
        if (type === 'item') {
          await pool.query(`UPDATE item SET status = $1 WHERE id = $2`, [status, id]);
        } else if (type === 'service') {
          await pool.query(`UPDATE service SET status = $1 WHERE id = $2`, [status, id]);
        }
      };

      await Promise.all([
        updateStatus(requested_type, requested_id, 'swapped'),
        updateStatus(offered_type, offered_id, 'swapped'),
      ]);
    }

    // Update notification as accepted
    await pool.query(`UPDATE notification SET accepted = true WHERE id = $1`, [notificationId]);

    // Fetch email from requested entity (item/service)
    let emailQuery;
    if (requested_type === 'item') {
      emailQuery = `SELECT email FROM item WHERE id = $1`;
    } else {
      emailQuery = `SELECT email FROM service WHERE id = $1`;
    }
    const emailResult = await pool.query(emailQuery, [requested_id]);

    if (emailResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: `${requested_type} email not found` });
    }
    const ownerEmail = emailResult.rows[0].email;

    // Fetch accepting user's detailed info (name, phone, email, city, subcity)
    const acceptingUserResult = await pool.query(
      `SELECT "Firstname", "Lastname", "Phone", "Email", "Location", "Subcity" FROM "user" WHERE id = $1`,
      [acceptingUserId]
    );

    if (acceptingUserResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Accepting user not found' });
    }

    const acceptingUser = acceptingUserResult.rows[0];
    const acceptingUserName = `${acceptingUser.Firstname} ${acceptingUser.Lastname}`;
    const acceptingUserPhone = acceptingUser.Phone || "N/A";
    const acceptingUserEmail = acceptingUser.Email || "N/A";
    const acceptingUserCity = acceptingUser.Location || "N/A";
    const acceptingUserSubcity = acceptingUser.Subcity || "N/A";

    // Compose email content
    const subject = 'Your Swap Request Has Been Accepted!';
    const text = `
Hello,

Your swap request has been accepted by ${acceptingUserName}.

Here are the details of the user who accepted your request:

Name: ${acceptingUserName}
Phone: ${acceptingUserPhone}
Email: ${acceptingUserEmail}
City: ${acceptingUserCity}
Subcity: ${acceptingUserSubcity}

Thank you for using our service!
`;

    const html = `
      <p>Hello,</p>
      <p>Your swap request has been accepted by <strong>${acceptingUserName}</strong>.</p>
      <p>Here are the details of the user who accepted your request:</p>
      <ul>
        <li><strong>Name:</strong> ${acceptingUserName}</li>
        <li><strong>Phone:</strong> ${acceptingUserPhone}</li>
        <li><strong>Email:</strong> ${acceptingUserEmail}</li>
        <li><strong>City:</strong> ${acceptingUserCity}</li>
        <li><strong>Subcity:</strong> ${acceptingUserSubcity}</li>
      </ul>
      <p>Thank you for using our service!</p>
    `;

    // Send email notification
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: ownerEmail,
      subject,
      text,
      html,
    });

    return res.status(200).json({ success: true, message: 'Swap request accepted and notification sent' });

  } catch (error) {
    console.error('Error accepting swap request:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});


// POST reject swap request by request ID
app.post('/api/swap-requests/reject/:requestId', async (req, res) => {
  const requestId = req.params.requestId;

  try {
    await pool.query(`DELETE FROM swap_request WHERE id = $1`, [requestId]);
    return res.status(200).json({ success: true, message: 'Swap request rejected' });
  } catch (error) {
    console.error('Error rejecting swap request:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// GET notifications for a specific user
app.get('/api/notifications/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    const result = await pool.query(
      `SELECT * FROM notification WHERE user_id = $1 AND accepted = false ORDER BY created_at DESC`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No notifications found for this user.' });
    }

    return res.status(200).json({ success: true, notifications: result.rows });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// POST accept notification by notification ID
app.post('/api/notifications/accept/:notificationId', async (req, res) => {
  const notificationId = req.params.notificationId;

  try {
    const notif = await pool.query(
      `SELECT requested_id, requested_type, offered_id, offered_type, is_money_offer FROM notification WHERE id = $1`,
      [notificationId]
    );

    if (notif.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    const { requested_id, requested_type, offered_id, offered_type, is_money_offer } = notif.rows[0];

    if (!is_money_offer) {
      const updateStatus = async (type, id, status) => {
        if (type === 'item') {
          await pool.query(`UPDATE item SET status = $1 WHERE id = $2`, [status, id]);
        } else if (type === 'service') {
          await pool.query(`UPDATE service SET status = $1 WHERE id = $2`, [status, id]);
        }
      };

      await Promise.all([
        updateStatus(requested_type, requested_id, 'swapped'),
        updateStatus(offered_type, offered_id, 'swapped'),
      ]);
    }

    const updateResult = await pool.query(`UPDATE notification SET accepted = true WHERE id = $1`, [notificationId]);

    if (updateResult.rowCount === 0) {
      console.warn("No rows updated for notification:", notificationId);
    }

    return res.status(200).json({ success: true, message: 'Notification accepted and status updated' });

  } catch (error) {
    console.error('Error accepting notification:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// POST reject notification by notification ID
app.post('/api/notifications/reject/:notificationId', async (req, res) => {
  const notificationId = req.params.notificationId;

  try {
    const notif = await pool.query(
      `SELECT requested_id, requested_type, offered_id, offered_type, is_money_offer FROM notification WHERE id = $1`,
      [notificationId]
    );

    if (notif.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    const { requested_id, requested_type, offered_id, offered_type, is_money_offer } = notif.rows[0];

    if (!is_money_offer) {
      const updateStatus = async (type, id, status) => {
        if (type === 'item') {
          await pool.query(`UPDATE item SET status = $1 WHERE id = $2`, [status, id]);
        } else if (type === 'service') {
          await pool.query(`UPDATE service SET status = $1 WHERE id = $2`, [status, id]);
        }
      };

      await Promise.all([
        updateStatus(requested_type, requested_id, 'draft'),
        updateStatus(offered_type, offered_id, 'draft'),
      ]);
    }

    // Optionally delete or update swap_request and notification entries here

    return res.status(200).json({ success: true, message: 'Notification rejected and status updated' });

  } catch (error) {
    console.error('Error rejecting notification:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});


// Start server

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}.`);
});