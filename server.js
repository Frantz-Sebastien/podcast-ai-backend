const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require('fs').promises; // Use fs.promises for async operations
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const speech = require('@google-cloud/speech');
require("dotenv").config(); // Load environment variables

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
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// Initialize multer upload middleware, ensuring it only accepts audio files
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("audio/")) {
      return cb(new Error("Only audio files are allowed"), false);
    }
    cb(null, true);
  }
});

// Route to handle audio uploads
app.post('/upload-audio', upload.single('audioFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  res.send({ message: 'File uploaded successfully', filePath: req.file.path });
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

    // Enhanced error handling (to prevent server crash)
    if (!result || !result.response || typeof result.response.text !== 'function') {
      return res.status(500).json({ error: "Unexpected response from AI model" });
    }

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

//
// app.post("/transcribe-audio", async (req, res) => {
//   const { filePath } = req.body; // Get file path from request body

//   if (!filePath) {
//     return res.status(400).json({ error: "Missing 'filePath' field." });
//   }

//   try {
//     const client = new speech.SpeechClient();

//     // Read the audio file and convert it to a Base64 string
//     const file = await fs.readFile(filePath);
//     const audioBytes = file.toString("base64");

//     // Configure the request for speech recognition
//     const request = {
//       audio: { content: audioBytes },
//       config: {
//         encoding: "LINEAR16", // Adjust based on your file format
//         sampleRateHertz: 16000,
//         languageCode: "en-US", // Change if using another language
//       },
//     };

//     // Perform the transcription
//     const [response] = await client.recognize(request);
//     const transcription = response.results
//       .map((result) => result.alternatives[0].transcript)
//       .join("\n");

//     res.json({ success: true, transcription });

//   } catch (error) {
//     console.error("Error transcribing audio:", error);
//     res.status(500).json({ error: "Failed to transcribe audio." });
//   }
// });

app.post("/transcribe-audio", async (req, res) => {
  const { filePath } = req.body; // Get the file path from the request body

  if (!filePath) {
    return res.status(400).json({ error: "Missing 'filePath' field." });
  }

  try {
    const client = new speech.SpeechClient(); // Initialize Google Speech client

    // Read the audio file and convert it to Base64
    const file = await fs.readFile(filePath);
    const audioBytes = file.toString("base64");

    // Configure the request for speech recognition
    const request = {
      audio: { content: audioBytes },
      config: {
        encoding: "LINEAR16", // Adjust based on your file format
        sampleRateHertz: 16000,
        languageCode: "en-US", // Change if using another language
      },
    };

    // Perform the transcription
    const [response] = await client.recognize(request);
    const transcription = response.results
      .map((result) => result.alternatives[0].transcript)
      .join("\n");

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


// async function testSpeech() {
//   const client = new speech.SpeechClient();
//   console.log("Google Cloud Speech-to-Text is set up correctly!");
// }

// testSpeech();