const { LLMClient } = require('../llm/llm-client');
const { ResponseSerializer } = require('../llm/response-serializer');
const logger = require('../utils/logger');
const { VertexAI } = require('@google-cloud/vertexai');
const { convertTools, convertMessages } = require('../utils/vertexai-converters');

// process.env.GOOGLE_APPLICATION_CREDENTIALS is required for Google Cloud authentication

class VertexAIClient extends LLMClient {
  constructor(config) {
    super(config);
    console.log("GOOGLE_APPLICATION_CREDENTIALS:", process.env.GOOGLE_APPLICATION_CREDENTIALS);
    
    // Pode adicionar padrões específicos do Vertex AI para retry
    this.addRetryableErrorPatterns([
      'vertex ai quota exceeded',
      'gemini rate limit',
      'resource exhausted'
    ]);
  }

  validateConfig() {
    if(!this.config || !this.config.llmProject) {
      throw new Error("VertexAIClient requires a valid configuration with a project ID.");
    }
    this._client = new VertexAI({ project: this.config.llmProject, location: this.config.llmLocation });
    this.model = this._client.getGenerativeModel({ model: this.config.llmModel });
  }

  // Implementação real do send (sem retry - isso fica na classe base)
  async _sendImplementation(messages, tools) {
    const request = this._buildRequest(messages, tools);
    const response = await this.model.generateContent(request);
    const result = this._parseResponse(response);
    return this.serializeResponse(result);
  }

  // Implementação real do stream (sem retry - isso fica na classe base)
  async _streamImplementation(messages, tools, model) {
    const request = this._buildRequest(messages, tools);
    const streamResponse = await this.model.generateContentStream(request);
    
    console.log('DEBUG VertexAI stream typeof:', typeof streamResponse);
    console.log('DEBUG VertexAI stream keys:', Object.keys(streamResponse));
    console.log('DEBUG VertexAI stream prototype:', Object.getPrototypeOf(streamResponse));

    // Initialize variables to accumulate the response
    const currentToolCalls = {};
    let currentContent = "";
    let currentToolCallId = null;

    // Return an async iterator that processes the Vertex AI stream
    return {
      [Symbol.asyncIterator]: async function* () {
        try {
          // Vertex AI returns an async iterable stream
          for await (const chunk of streamResponse.stream) {
            try {
              const candidate = chunk.candidates?.[0];
              if (!candidate) continue;

              const parts = candidate?.content?.parts || [];
              
              for (const part of parts) {
                // Handle text content
                if (part.text) {
                  currentContent += part.text;
                  yield {
                    type: "content",
                    content: part.text
                  };
                }
                
                // Handle function calls
                if (part.functionCall) {
                  const functionCall = part.functionCall;
                  currentToolCallId = functionCall.name + '_' + Date.now(); // Generate unique ID
                  
                  currentToolCalls[currentToolCallId] = {
                    id: currentToolCallId,
                    type: "function",
                    function: {
                      name: functionCall.name,
                      arguments: JSON.stringify(functionCall.args || {})
                    }
                  };
                  
                  yield {
                    type: "tool_call",
                    tool_call: currentToolCalls[currentToolCallId]
                  };
                }
              }
              
              // Handle finish reason
              const finishReason = candidate?.finishReason;
              if (finishReason) {
                yield {
                  type: "finish",
                  finish_reason: finishReason,
                  final_content: currentContent,
                  final_tool_calls: Object.values(currentToolCalls).length > 0 ? Object.values(currentToolCalls) : null
                };
                break; // Exit the loop when finished
              }
            } catch (chunkError) {
              console.error(`Error processing chunk: ${chunkError}`);
              yield { 
                type: "error", 
                error: "Chunk processing error", 
                details: chunkError.message,
                retryable: this._isRetryableErrorWithCustom ? this._isRetryableErrorWithCustom(chunkError) : false
              };
            }
          }
        } catch (streamError) {
          console.error(`Error in stream iteration: ${streamError}`);
          yield { 
            type: "error", 
            error: "Stream iteration error", 
            details: streamError.message,
            status: streamError.status || streamError.code,
            retryable: this._isRetryableErrorWithCustom ? this._isRetryableErrorWithCustom(streamError) : false
          };
        }
      }.bind(this)
    };
  }

  // Implementação do STT (se necessário)
  async _sttImplementation(audioFilePath) {
    throw new Error('STT not implemented for VertexAI');
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