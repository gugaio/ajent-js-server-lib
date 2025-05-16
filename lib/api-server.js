/* global process */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { LLMFactory } = require('../ajent/llm-factory');



/**
 * Creates and configures an Express API server with routes for LLM interaction
 * 
 * @param {Object} options - Configuration options for the API server
 * @param {number} [options.port=3000] - Port to listen on
 * @param {string} [options.uploadDir='./uploads'] - Directory to store temporary uploads
 * @param {Function} [options.beforeRequest] - Hook called before processing a request
 * @param {Function} [options.afterResponse] - Hook called after generating a response
 * @param {Function} [options.errorHandler] - Custom error handler
 * @returns {Object} Express app instance and server control methods
 */
function createApiServer(options = {}) {
  const {
    port = 3000,
    uploadDir = './uploads',
    beforeRequest,
    afterResponse,
    errorHandler
  } = options;

  // Create Express app
  const app = express();

  app.use(cors());

  
  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const fullUploadDir = path.resolve(process.cwd(), uploadDir);
      if (!fs.existsSync(fullUploadDir)) {
        fs.mkdirSync(fullUploadDir, { recursive: true });
      }
      cb(null, fullUploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    }
  });

  const upload = multer({ storage });

  // Middleware
  app.use(bodyParser.json());

  // Custom middleware for hooks
  app.use((req, res, next) => {
    // Add helper to easily send error responses
    res.sendError = (status, error, details) => {
      return res.status(status).json({ error, details });
    };
    next();
  });

  // Default error handler function
  const defaultErrorHandler = (err, req, res) => {
    console.error('API error:', err);
    return res.sendError(500, 'Internal server error', err.message);
  };

  // Routes
  app.post('/message', async (req, res) => {
    try {
      const { messages, tools,llmToken, stream } = req.body;

      const llmName = req.body.llmName || "openai"
      const model = req.body.model || "gpt-3.5-turbo"
      
      // Validate required parameters
      if (!llmName) {
        return res.sendError(400, 'Missing required parameters', 'llmName and llmToken are required');
      }
      
      // Call the beforeRequest hook if provided
      if (typeof beforeRequest === 'function') {
        const shouldContinue = await beforeRequest(req, res);
        if (shouldContinue === false) return; // Hook handled the response
      }
      
      // Get LLM client
      const client = LLMFactory.createClient(llmName, llmToken);
      
      if (!client) {
        return res.sendError(400, 'Invalid LLM name', `LLM "${llmName}" is not supported`);
      }
      
      let response;
      
      if (stream) {
        // Handle streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        const streamGenerator = await client.stream(messages, tools || [], model);
        
        // Call afterResponse hook once if provided
        if (typeof afterResponse === 'function') {
          afterResponse(req, { streaming: true });
        }
        
        for await (const chunk of streamGenerator) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        
        return res.end();
      } else {
        // Handle normal response
        response = await client.send(messages, tools || [], model);
        
        // Call afterResponse hook if provided
        if (typeof afterResponse === 'function') {
          const modifiedResponse = await afterResponse(req, response);
          if (modifiedResponse) {
            response = modifiedResponse;
          }
        }

        const result = {
          message: response,
        }
        
        return res.json(result);
      }
    } catch (error) {
      // Use custom error handler if provided, otherwise use default
      if (typeof errorHandler === 'function') {
        return errorHandler(error, req, res);
      } else {
        return defaultErrorHandler(error, req, res);
      }
    }
  });

  app.post('/audio_message', upload.single('audio'), async (req, res) => {
    try {
      const { llmName, llmToken } = req.body;
      
      // Validate required parameters
      if (!llmName || !llmToken) {
        return res.sendError(400, 'Missing required parameters', 'llmName and llmToken are required');
      }
      
      if (!req.file) {
        return res.sendError(400, 'Missing file', 'No audio file uploaded');
      }
      
      // Call the beforeRequest hook if provided
      if (typeof beforeRequest === 'function') {
        const shouldContinue = await beforeRequest(req, res);
        if (shouldContinue === false) return; // Hook handled the response
      }
      
      // Get LLM client
      const client = LLMFactory.createClient(llmName, llmToken);
      
      if (!client) {
        return res.sendError(400, 'Invalid LLM name', `LLM "${llmName}" is not supported`);
      }
      
      const audioFilePath = req.file.path;
      const transcription = await client.stt(audioFilePath);
      
      // Clean up uploaded file
      fs.unlinkSync(audioFilePath);
      
      const response = { transcription };
      
      // Call afterResponse hook if provided
      if (typeof afterResponse === 'function') {
        const modifiedResponse = await afterResponse(req, response);
        if (modifiedResponse) {
          return res.json(modifiedResponse);
        }
      }
      
      return res.json(response);
    } catch (error) {
      // Use custom error handler if provided, otherwise use default
      if (typeof errorHandler === 'function') {
        return errorHandler(error, req, res);
      } else {
        return defaultErrorHandler(error, req, res);
      }
    }
  });

  // Server control methods
  let server = null;
  
  return {
    app,
    
    // Start the server
    start: (customPort) => {
      const serverPort = customPort || port;
      server = app.listen(serverPort, () => {
        console.log(`Ajent API server running on port ${serverPort}`);
      });
      return server;
    },
    
    // Stop the server
    stop: () => {
      if (server) {
        server.close();
        server = null;
      }
    }
  };
}

module.exports = createApiServer;