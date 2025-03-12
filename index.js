const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();



app.get('/', (req, res)=>{
    res.send("hello there")
})
app.listen(process.env.PORT)