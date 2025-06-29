const { OpenAIClient } = require('../openai');
const { VertexAIClient } = require('../gemini');

class LLMFactory {
  static createClient(config) {
    if (!config || !config.llmName) {
      throw new Error("LLMFactory requires a valid configuration with an llmName.");
    }

    switch (config.llmName.toLowerCase()) {
      case 'openai':
        return new OpenAIClient(config);
      case 'gemini':
        return new VertexAIClient(config);
      default:
        throw new Error(`Unsupported LLM provider: ${config.llmName}`);
    }
  }
}

module.exports = { LLMFactory };