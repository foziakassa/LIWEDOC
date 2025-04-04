app.post("/users", async (req, res) => {
    const { Firstname, Lastname, Email, Password, Role } = req.body;

    if (!Firstname || !Lastname || !Email || !Password || !Role) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        // Check for existing user with lowercase email
        const userCheck = await pool.query("SELECT * FROM \"users\" WHERE \"Email\" = $1", [Email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: "User already exists." });
        }

        const hashedPassword = await bcrypt.hash(Password, 10);
        const newUser = await pool.query(
            "INSERT INTO \"users\" (\"Firstname\", \"Lastname\", \"Email\", \"Password\", \"Role\") VALUES ($1, $2, $3, $4, $5) RETURNING *", // Added Role to the query
            [Firstname, Lastname, Email, hashedPassword, Role] // Ensure Role is included here
        );

        return res.status(201).json(newUser.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});