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

  async stream(messages, tools, model) {
    try {
      const request = this._buildRequest(messages, tools);
      const stream = await this.model.generateContentStream(request);

      // Initialize variables to accumulate the response
      const currentToolCalls = {};
      let currentContent = "";
      let currentToolCallId = null;

      // Return an async generator
      return {
        [Symbol.asyncIterator]: async function* () {
          try {
            for await (const chunk of stream) {
              const candidate = chunk.candidates?.[0];
              const parts = candidate?.content?.parts || [];

              // Process each part in the chunk
              for (const part of parts) {
                // Handle content
                if (part.text) {
                  currentContent += part.text;
                  yield {
                    type: "content",
                    content: part.text
                  };
                }

                // Handle tool calls
                if (part.functionCall) {
                  currentToolCallId = part.functionCall.name;
                  console.log(`Tool call id: ${currentToolCallId}`);
                  
                  if (!currentToolCalls[currentToolCallId]) {
                    console.log(`Tool call not found, creating new one. Tool call id: ${currentToolCallId}`);
                    console.log(`Existing tool calls: ${JSON.stringify(currentToolCalls)}`);
                    currentToolCalls[currentToolCallId] = {
                      id: currentToolCallId,
                      type: "function",
                      function: { 
                        name: part.functionCall.name, 
                        arguments: JSON.stringify(part.functionCall.args || {})
                      }
                    };
                  } else {
                    // Update existing tool call (if needed for incremental arguments)
                    currentToolCalls[currentToolCallId].function.arguments = JSON.stringify(part.functionCall.args || {});
                  }

                  yield {
                    type: "tool_call",
                    tool_call: currentToolCalls[currentToolCallId]
                  };
                }
              }

              // Check for finish reason
              const finishReason = candidate?.finishReason;
              if (finishReason) {
                yield {
                  type: "finish",
                  finish_reason: finishReason,
                  final_content: currentContent,
                  final_tool_calls: Object.values(currentToolCalls).length > 0 ? Object.values(currentToolCalls) : null
                };
              }
            }
          } catch (error) {
            logger.error(`Error in stream generator: ${error}`);
            yield { error: "Stream error", details: error.message };
          }
        }
      };
    } catch (error) {
      logger.error(`Error initializing stream: ${error}`);
      return {
        [Symbol.asyncIterator]: async function* () {
          yield { error: "Stream initialization error", details: error.message };
        }
      };
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