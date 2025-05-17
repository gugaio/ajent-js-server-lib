const { OpenAIClient } = require('./openai');

class LLMFactory {
  static createClient(llmName, llmToken) {
    const switcher = {
      'openai': new OpenAIClient(llmToken)
    };

    return switcher[llmName.toLowerCase()];
  }
}

module.exports = { LLMFactory };