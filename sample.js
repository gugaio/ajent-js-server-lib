const { createApiServer } = require('./lib');

// Create an API server with custom options
const api = createApiServer({
  port: 3001,
  llmToken: 'your-token-here',
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
    if (error.message.includes('rate limit')) {
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