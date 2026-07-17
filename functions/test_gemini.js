const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from .env file
const envConfig = dotenv.parse(fs.readFileSync('.env'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

async function testGemini() {
  console.log("Testing Gemini API connection...");
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
    console.error("❌ API Key not found or still set to default placeholder in .env");
    process.exit(1);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    console.log("Sending prompt to Gemini: 'Say hello in Hebrew'...");
    const result = await model.generateContent("Say hello in Hebrew. Just the word, nothing else.");
    const text = result.response.text();
    
    console.log("✅ Success! Gemini responded:");
    console.log(text);
  } catch (error) {
    console.error("❌ Failed to connect to Gemini API:");
    console.error(error.message);
  }
}

testGemini();
