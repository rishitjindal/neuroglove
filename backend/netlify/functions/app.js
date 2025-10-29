// netlify/functions/app.js
const serverless = require("serverless-http");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const cors = require("cors");
app.use(cors({ origin: "*" }));


// Example endpoint
app.get("/api/hello", (req, res) => {
    res.json({ message: "Hello from NeuroGlove backend!" });
});

// Add your other backend routes here

module.exports.handler = serverless(app);
