class LLMClient {

    constructor(config) {
      this.config = config;
      this.validateConfig();
    }

    validateConfig() {
      throw new Error('Method validateConfig() must be implemented');
    }
    
    async send(messages, tools, model) {
      throw new Error('Method send() must be implemented');
    }
    
    async stream(messages, tools, model) {
      throw new Error('Method stream() must be implemented');
    }
    
    serializeResponse(response) {
      throw new Error('Method serializeResponse() must be implemented');
    }
    
    async stt(audioFilePath) {
      throw new Error('Method stt() must be implemented');
    }
  }
  
  module.exports = { LLMClient };