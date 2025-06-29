
const dotenv = require('dotenv');
dotenv.config();

const createLLMServer = require('./src/api/factory-api-server');

// Create an API server with Gemini (Vertex AI) options
const api = createLLMServer({
  llmName: 'gemini',
  llmModel: 'gemini-2.5-pro',
  llmLocation: 'us-central1',
  port: 3001,
  llmProject: 'ajent-445416',
  uploadDir: './temp-uploads',

  // Optional hook before processing a request
  beforeRequest: (req, res) => {
    console.log(`Received ${req.method} request to ${req.path}`);
    return true; // Continue processing
  },

  // Optional hook after generating a response
  afterResponse: (req, response) => {
    console.log('Request processed successfully');
    return response;
  },

  // Optional custom error handler
  errorHandler: (error, req, res) => {
    console.error('Error processing request:', error);

    // Custom error categorization
    if (error.message && error.message.includes('rate limit')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        details: 'Please try again later',
        retry_after: 60
      });
    }

    return res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

// Start the server
api.start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  api.stop();
  process.exit(0);
});