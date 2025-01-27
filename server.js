const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config(); // Load environment variables

const app = express();
const PORT = 4000;

// Middleware
app.use(cors());
app.use(express.json()); // For parsing JSON request bodies

// Initialize Google Generative AI Client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_CLOUD_API_KEY);

// Route to generate podcast content
app.post("/generate-podcast", async (req, res) => {
  const { prompt } = req.body; // Expecting 'prompt' in the request body

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Invalid or missing 'prompt' field." });
  }

  try {
    // Initialize the model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    //Modify the prompt so that it creates a podcast in conversation format
    const conversationPodcast = `Write a podcast where two hosts (you can name the hosts) discuss the following topic: "${prompt}". One of the hosts should be curious asking questions, and the other should be knowledgeable when answering. The conversation should feel natural and engaging.`

    // Generate content
    const result = await model.generateContent(conversationPodcast);

    // Send the response back to the client
    res.json({
      success: true,
      generatedText: result.response.text(),
    });
  } catch (error) {
    console.error("Error generating content:", error);
    res.status(500).json({ error: "Failed to generate podcast content." });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
