const { OpenAIClient } = require('./openai');
const { VertexAIClient } = require('./gemini');

class LLMFactory {
  static createClient(llmName, llmToken) {
    const switcher = {
      'openai': new OpenAIClient(llmToken),
      'gemini': new VertexAIClient(llmToken),
    };

    return switcher[llmName.toLowerCase()];
  }

  static createGeminiClient(projectId, location = 'us-central1', model = 'gemini-2.5-flash-preview-05-20') {
    return new VertexAIClient(projectId, location, model);
  }
}

module.exports = { LLMFactory };