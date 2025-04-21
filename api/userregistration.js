const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const cors = require("cors");
const multer = require("multer");
require("dotenv").config();
const nodemailer = require("nodemailer");
const crypto = require("crypto");

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
app.use(cors());
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
        const activationLink = `http://localhost:3000/activate/${token}`;


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

app.get("/activate/:token", async (req, res) => {
    const token = req.params.token;

    console.log("Activation token received:", token);

    try {
        console.log("Activation token received:", token);
        // Check if the token is valid
        const result = await pool.query("SELECT * FROM \"ActivationToken\" WHERE \"Token\" = $1 AND \"Expiredat\" > NOW()", [token]);

        if (result.rows.length === 0) {
            console.error("Invalid or expired token.");
            return res.status(400).json({ error: "Invalid or expired token." });
        }

        const userId = result.rows[0].id; // Ensure this is the correct ID
        console.log("User ID retrieved for activation:", userId);

        // Attempt to update the user
        const updateResult = await pool.query("UPDATE \"user\" SET \"activated\" = true WHERE \"id\" = $1", [userId]);
        console.log("Update result row count:", updateResult.rowCount);

        await pool.query("DELETE FROM \"ActivationToken\" WHERE \"Token\" = $1", [token]);

        return res.status(200).json({ message: "Your account has been activated. You can now log in." });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});


// DELETE route to delete a user
app.delete("/users/:id", async (req, res) => {
    const userId = req.params.id;

    try {
        // Check if the user exists
        const userCheck = await pool.query("SELECT * FROM \"user\" WHERE \"id\" = $1", [userId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: "User not found." });
        }

        // Soft delete the user by updating the Deletedat column
        const deleteUser = await pool.query(
            "UPDATE \"user\" SET \"Deletedat\" = NOW() WHERE \"id\" = $1 RETURNING *",
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











// app.get("/charities", async (req, res) => {
//     try {
//         const result = await pool.query("SELECT * FROM charities WHERE deleted_at IS NULL");
//         res.status(200).json(result.rows);
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// });


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

// DELETE route to soft delete a charity
app.delete("/charities/:id", async (req, res) => {
    const charityId = req.params.id;

    try {
        const result = await pool.query(
            "UPDATE charities SET deleted_at = NOW() WHERE id = $1 RETURNING *",
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
app.post("/advertisements", upload.single('product_image'), async (req, res) => {
    const { company_name, email, phone_number, product_description } = req.body;
    const product_image = req.file.buffer 

    try {
//////////////////////////////////////////
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
app.patch("/advertisements/:id/approve", async (req, res) => {
    const adId = req.params.id;

    try {
        const result = await pool.query(
            "UPDATE advertisements SET approved = TRUE WHERE id = $1 RETURNING *",
            [adId]
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
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Retrieve approved advertisements
app.get("/advertisements/approved", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM advertisements WHERE approved = TRUE");
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});



app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}.`);
});