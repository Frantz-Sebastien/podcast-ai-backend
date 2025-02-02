const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require('fs').promises; // Use fs.promises for async operations
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const speech = require('@google-cloud/speech');
const ffmpeg = require('fluent-ffmpeg');
require("dotenv").config(); // Load environment variables

//Check for missing API key
if (!process.env.GOOGLE_CLOUD_API_KEY) {
  console.error("❌ Missing GOOGLE_CLOUD_API_KEY in .env file. Exiting...");
  process.exit(1); // Stop the server if API key is missing
}

const app = express();
const PORT = 4000;

// Middleware
app.use(cors());
app.use(express.json()); // For parsing JSON request bodies

// Initialize Google Generative AI Client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_CLOUD_API_KEY);

// Define the upload directory
const uploadDir = path.join(__dirname, 'uploads');

// ✅ Fix: Only use async mkdir, remove fs.existsSync() and mkdirSync()
(async () => {
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    console.log("Uploads directory is ready.");
  } catch (error) {
    console.error("Error creating upload directory:", error);
  }
})();

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

async function convertM4AToWav(inputPath) {
  const outputPath = inputPath.replace(".m4a", ".wav");
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('wav')
      .on('end', () => resolve(outputPath))
      .on('error', (err) => {
        console.error("FFmpeg conversion error:", err)
        reject(err)
      })
      .save(outputPath);
  });
}

// Initialize multer upload middleware, ensuring it only accepts audio files
const allowedMimeTypes = ["audio/wav", "audio/mpeg", "audio/flac", "audio/mp4"];
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Only WAV, MP3, FLAC, and M4A audio files are allowed"), false);
    }
    cb(null, true);
  }
});


// Route to handle audio uploads
app.post('/upload-audio', upload.single('audioFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "File upload failed. Ensure you are uploading a valid audio file." });
  }
  res.json({ message: 'File uploaded successfully', filePath: req.file.path });
});


// Route to generate podcast content
app.post("/generate-podcast", async (req, res) => {
  const { prompt } = req.body; // Expecting 'prompt' in the request body

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Invalid or missing 'prompt' field." });
  }

  try {
    // Initialize the model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Modify the prompt so that it creates a podcast in conversation format
    const conversationPodcast = `Write a podcast where two hosts (you can name the hosts) discuss the following topic: "${prompt}". One of the hosts should be curious asking questions, and the other should be knowledgeable when answering. The conversation should feel natural and engaging. Do not include any asterisk.`;

    // Generate content
    const result = await model.generateContent(conversationPodcast);

    if (!result || !result.response || !result.response.candidates || !result.response.candidates.length) {
      return res.status(500).json({ error: "Unexpected response from AI model." });
    }
    
    const generatedText = result.response.candidates[0].content.parts.map(p => p.text).join("\n");
    

    // Send the response back to the client
    res.json({
      success: true,
      generatedText,
    });
  } catch (error) {
    console.error("Error generating content:", error);
    res.status(500).json({ error: "Failed to generate podcast content." });
  }
});


app.post("/transcribe-audio", async (req, res) => {
  let { filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: "Missing 'filePath' field." });
  }

  try {
    await fs.access(filePath); // Ensure file exists

    // Convert M4A to WAV if needed
    if (filePath.endsWith(".m4a")) {
      filePath = await convertM4AToWav(filePath);
    }

    const client = new speech.SpeechClient();
    const file = await fs.readFile(filePath);
    const audioBytes = file.toString("base64");

    const request = {
      audio: { content: audioBytes },
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 16000,
        languageCode: "en-US",
      },
    };

    const [response] = await client.recognize(request);
    const transcription = response.results.map(r => r.alternatives[0].transcript).join("\n");

    res.json({ success: true, transcription });

  } catch (error) {
    console.error("Error transcribing audio:", error);
    res.status(500).json({ error: "Failed to transcribe audio." });
  }
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
