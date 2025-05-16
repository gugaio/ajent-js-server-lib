const { LLMClient } = require('../ajent/llm-client');
const { LLMFactory } = require('../ajent/llm-factory');
const { ResponseSerializer } = require('../ajent/response-serializer');
const { OpenAIClient } = require('../ajent/openai');
const createApiServer = require('./api-server');


/**
 * Main export of the Ajent library
 */
module.exports = {
    // Core classes
    LLMClient,
    LLMFactory,
    ResponseSerializer,
    
    // Client implementations
    OpenAIClient,
    
    // Factory method for creating LLM clients
    createClient: (llmName, llmToken) => LLMFactory.createClient(llmName, llmToken),
    
    // Express API server factory
    createApiServer
  };