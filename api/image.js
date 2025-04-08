import { Pool } from "pg";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

// PostgreSQL connection setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// API endpoint to insert only an image into the users table
export default function imageUploadHandler(req, res) {
    if (req.method === 'POST') {
        upload.single('image')(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: "Error uploading image." });
            }

            if (!req.file) {
                return res.status(400).json({ error: "Image is required." });
            }

            const imageData = req.file.buffer;
            const email = req.body.Email; // Assuming Email is passed to associate the image

            try {
                // Check if the user exists based on Email
                const userCheck = await pool.query("SELECT * FROM \"users\" WHERE \"Email\" = $1", [email]);
                if (userCheck.rows.length === 0) {
                    return res.status(404).json({ error: "User not found." });
                }

                // Update the user's image
                const updatedUser = await pool.query(
                    "UPDATE \"users\" SET \"Image\" = $1 WHERE \"Email\" = $2 RETURNING *",
                    [imageData, email]
                );

                return res.status(200).json(updatedUser.rows[0]);
            } catch (err) {
                console.error(err);
                return res.status(500).json({ error: "Internal Server Error" });
            }
        });
    } else {
        // Handle any other HTTP method
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}