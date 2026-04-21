require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express(); 

const PORT = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());



// server start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});