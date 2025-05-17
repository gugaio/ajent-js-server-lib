import { OpenAIClient } from './openai';

class LLMFactory {
  static createClient(llmName, llmToken) {
    const switcher = {
      'openai': new OpenAIClient(llmToken)
    };
    
    return switcher[llmName.toLowerCase()];
  }
}

export { LLMFactory };