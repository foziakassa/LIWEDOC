const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    console.log("Received a request"); // Logging for debugging
    res.send("Express on Vercel");
});

app.listen(PORT, () => console.log(`Server ready on port ${PORT}.`));

module.exports = app;