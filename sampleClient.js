// Simple Node.js client to test sampleGemini.js API server

const axios = require('axios');

async function sendMessage() {
  try {

    const sampleMessage = {
      role: 'user',
      content: 'Hello Gemini! Can you summarize what you are?'
    };

    const response = await axios.post('http://localhost:3001/agent/message', {
      messages: [sampleMessage]
      // Optionally, you can add "tools": [] if needed
    });

    console.log('Response:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else {
      console.error('Request Error:', error.message);
    }
  }
}

sendMessage();