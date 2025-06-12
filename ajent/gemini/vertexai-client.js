const { LLMClient } = require('../llm-client');
const { ResponseSerializer } = require('../response-serializer');
const logger = require('../utils/logger');
const { VertexAI } = require('@google-cloud/vertexai');
const { convertTools, convertMessages } = require('../utils/vertexai-converters');

// process.env.GOOGLE_APPLICATION_CREDENTIALS  is required for Google Cloud authentication

class VertexAIClient extends LLMClient {
  constructor(config) {
    super(config);
    console.log("GOOGLE_APPLICATION_CREDENTIALS:", process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  validateConfig() {
      if(!this.config || !this.config.llmProject) {
        throw new Error("VertexAIClient requires a valid configuration with a project ID.");
      }
      this._client = new VertexAI({ project: this.config.llmProject, location: this.config.llmLocation });
      this.model = this._client.getGenerativeModel({ model: this.config.llmModel });
  }

  async send(messages, tools) {
    try {
      const request = this._buildRequest(messages, tools);
      const response = await this.model.generateContent(request);
      const result = this._parseResponse(response);

      return this.serializeResponse(result);
    } catch (error) {
      logger.error(`Vertex AI error: ${error}`);
      return { error: 'Vertex AI error', details: error.message };
    }
  }

  _buildRequest(messages, tools) {
    const request = {
      contents: convertMessages(messages),
    };
    const convertedTools = convertTools(tools);
    if (convertedTools.length > 0) {
      request.tools = convertedTools;
    }
    return request;
  }

  _parseResponse(response) {
    const candidate = response.response?.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    let content = '';
    const tool_calls = [];

    for (const part of parts) {
      if (part.text) {
        content += part.text;
      }
      if (part.functionCall) {
        tool_calls.push({
          id: part.functionCall.name,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {})
          }
        });
      }
    }

    const result = {
      role: 'assistant',
      content: content || '',
    };

    if (tool_calls.length > 0) {
      result.tool_calls = tool_calls;
    }

    return result;
  }

  serializeResponse(response) {
    return ResponseSerializer.serializeMessage(response);
  }
}

module.exports = { VertexAIClient };