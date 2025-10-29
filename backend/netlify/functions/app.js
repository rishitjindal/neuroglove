// netlify/functions/app.js
const serverless = require("serverless-http");
const express = require("express");
const app = express();

// Example route
app.get("/api/data", (req, res) => {
    res.json({ message: "Hello from Express on Netlify Functions!" });
});

module.exports.handler = serverless(app);
