const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { LLMFactory } = require('../ajent/llm-factory');

/**
 * Creates and configures an Express API server with routes for LLM interaction,
 * or attaches these routes to an existing Express app
 * 
 * @param {Object} options - Configuration options for the API server
 * @param {Object} [options.app] - Existing Express app to attach routes to
 * @param {number} [options.port=3000] - Port to listen on (when creating a new app)
 * @param {string} [options.uploadDir='./uploads'] - Directory to store temporary uploads
 * @param {Function} [options.beforeRequest] - Hook called before processing a request
 * @param {Function} [options.afterResponse] - Hook called after generating a response
 * @param {Function} [options.errorHandler] - Custom error handler
 * @returns {Object} Express app instance and server control methods
 */
function createApiServer(options = {}) {
  const {
    app: existingApp,
    port = 3000,
    uploadDir = './uploads',
    beforeRequest,
    afterResponse,
    errorHandler
  } = options;

  const defaultLlmToken = options.llmToken;
  const defaultLlmName = options.llmName || 'openai';
  const defaultLlmModel = options.llmModel || 'gpt-4.1-mini';
  
  // Use existing app or create a new one
  const app = existingApp || express();

  // Only apply these middleware if we're creating a new app
  // Otherwise assume the existing app already has appropriate middleware
  if (!existingApp) {
    app.use(cors());
    app.use(bodyParser.json());
  }
  
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

  // Custom middleware for hooks - only added to our routes
  const ajentMiddleware = (req, res, next) => {
    // Add helper to easily send error responses
    res.sendError = (status, error, details) => {
      return res.status(status).json({ error, details });
    };
    next();
  };

  // Default error handler function
  const defaultErrorHandler = (err, req, res) => {
    console.error('API error:', err);
    return res.sendError(500, 'Internal server error', err.message);
  };

  // Define a router for our agent routes
  const agentRouter = express.Router();
  agentRouter.use(ajentMiddleware);
  
  // Routes
  agentRouter.post('/message', async (req, res) => {
    try {

      const payload = req.body;
      const payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
      console.log('Payload:', payload);
      console.log('Payload size (bytes):', payloadSize);

      const { messages, tools } = req.body;

      const llmName = req.body.llmName || defaultLlmName
      const llmToken = req.body.llmToken || defaultLlmToken
      const llmModel = req.body.model || defaultLlmModel
      
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
      
      // Handle normal response
      response = await client.send(messages, tools || [], llmModel);
        
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
    } catch (error) {
      // Use custom error handler if provided, otherwise use default
      if (typeof errorHandler === 'function') {
        return errorHandler(error, req, res);
      } else {
        return defaultErrorHandler(error, req, res);
      }
    }
  });

  agentRouter.post('/message/stream', async (req, res) => {
    try {

      const payload = req.body;
      const payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
      console.log('Payload stream:', payload);
      console.log('Payload size (bytes):', payloadSize);

      const { messages, tools } = req.body;

      const llmName = req.body.llmName || defaultLlmName
      const llmToken = req.body.llmToken || defaultLlmToken
      const llmModel = req.body.model || defaultLlmModel
      
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
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const streamGenerator = await client.stream(messages, tools || [], llmModel);
      
      // Call afterResponse hook once if provided
      if (typeof afterResponse === 'function') {
        afterResponse(req, { streaming: true });
      }
      
      for await (const chunk of streamGenerator) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      
      return res.end();
    } catch (error) {
      // Use custom error handler if provided, otherwise use default
      if (typeof errorHandler === 'function') {
        return errorHandler(error, req, res);
      } else {
        return defaultErrorHandler(error, req, res);
      }
    }
  });

  agentRouter.post('/audio_message', upload.single('audio'), async (req, res) => {
    try {
      const llmName = req.body.llmName || defaultLlmName
      const llmToken = req.body.llmToken || defaultLlmToken
      
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

  // Mount the agent router to the app
  app.use('/agent', agentRouter);

  // Server control methods
  let server = null;
  
  return {
    app,
    
    // Start the server (only if we created a new app)
    start: (customPort) => {
      if (existingApp) {
        console.log('Using existing Express app - server control methods are disabled');
        return null;
      }
      
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