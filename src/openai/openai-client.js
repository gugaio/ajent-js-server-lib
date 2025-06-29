const { LLMClient } = require('../llm/llm-client');
const { ResponseSerializer } = require('../llm/response-serializer');
const OpenAI = require('openai');
const fs = require('fs');
const logger = require('../utils/logger');

class OpenAIClient extends LLMClient {
  constructor(config) {
    super(config);

  }

  validateConfig() {
    if(!this.config || !this.config.llmToken) {
      throw new Error("OpenAIClient requires a valid configuration with an API token.");
    }
      this._client = new OpenAI({ apiKey: this.config.llmToken });
    }

  async _sendImplementation(messages, tools, model) {
    try {
      const response = await this._client.chat.completions.create({
        model: model || this.config.model || "gpt-4.1",
        messages: messages,
        tools: tools
      });
      
      const message = response.choices[0].message;
      return this.serializeResponse(message);
    } catch (error) {
      if (error.name === 'APIError') {
        logger.error(`OpenAI API error: ${error}`);
        throw new Error(`OpenAI API error: ${error.message}`, error.code);
      } else if (error.name === 'RateLimitError') {
        logger.warn("Rate limit exceeded. Please slow down your requests.");
        throw new Error(`Rate limit exceeded: ${error.message}`, error.code);
      } else if (error.name === 'InvalidRequestError') {
        logger.error(`Invalid request: ${error}`);
        throw new Error(`Invalid request: ${error.message}`, error.code);
      } else if (error.name === 'AuthenticationError') {
        logger.error(`Authentication error: ${error}`);
        throw new Error(`Authentication error: ${error.message}`, error.code);
      } else if (error.name === 'OpenAIError') {
        logger.error(`General OpenAI error: ${error}`);
        throw new Error(`OpenAI error: ${error.message}`, error.code);
      } else {
        logger.error(`Unexpected error occurred: ${error}`);
        throw new Error(`Unexpected error: ${error.message}`, error.code);
      }
    }
  }

  serializeResponse(response) {
    return ResponseSerializer.serializeMessage(response);
  }

  async _streamImplementation(messages, tools, model) {
    try {
      const stream = await this._client.chat.completions.create({
        model: model,
        messages: messages,
        tools: tools,
        stream: true
      });

      // Initialize variables to accumulate the response
      const currentToolCalls = {};
      let currentContent = "";
      let currentToolCallId = null;

      // Return an async generator
      return {
        [Symbol.asyncIterator]: async function* () {
          try {
            for await (const chunk of stream) {
              const delta = chunk.choices[0]?.delta;
              
              // Handle tool calls
              if (delta.tool_calls && delta.tool_calls.length > 0) {
                for (const toolCall of delta.tool_calls) {
                  if (toolCall.id) {
                    currentToolCallId = toolCall.id;
                    console.log(`Tool call id: ${currentToolCallId}`);
                  } else {
                    console.log("Tool call id not found, keep using the previous one");
                  }
                  
                  if (!currentToolCalls[currentToolCallId]) {
                    console.log(`Tool call not found, creating new one. Tool call id: ${currentToolCallId}`);
                    console.log(`Existing tool calls: ${JSON.stringify(currentToolCalls)}`);
                    currentToolCalls[currentToolCallId] = {
                      id: currentToolCallId,
                      type: "function",
                      function: { name: "", arguments: "" }
                    };
                  }
                  
                  if (toolCall.function?.name) {
                    console.log("Tool call function name found");
                    currentToolCalls[currentToolCallId].function.name = toolCall.function.name;
                  }
                  
                  if (toolCall.function?.arguments) {
                    console.log("Tool call function arguments found");
                    currentToolCalls[currentToolCallId].function.arguments += toolCall.function.arguments;
                  }
                  
                  yield {
                    type: "tool_call",
                    tool_call: currentToolCalls[currentToolCallId]
                  };
                }
              }
              
              // Handle content
              if (delta.content) {
                currentContent += delta.content;
                yield {
                  type: "content",
                  content: delta.content
                };
              }
              
              // Handle end of response
              if (chunk.choices[0]?.finish_reason) {
                yield {
                  type: "finish",
                  finish_reason: chunk.choices[0].finish_reason,
                  final_content: currentContent,
                  final_tool_calls: Object.values(currentToolCalls).length > 0 ? Object.values(currentToolCalls) : null
                };
              }
            }
          } catch (error) {
            logger.error(`Error in stream generator: ${error}`);
            yield { error: "Stream error", details: error.message, status: error.status || error.code, retryable: this._isRetryableErrorWithCustom ? this._isRetryableErrorWithCustom(error) : false };
          }
        }
      };
    } catch (error) {
      logger.error(`Error initializing stream: ${error}`);
      return {
        [Symbol.asyncIterator]: async function* () {
          yield { error: "Stream initialization error", details: error.message, status: error.status || error.code };
        }
      };
    }
  }

  async stt(audioFilePath) {
    try {
      const audioFile = fs.createReadStream(audioFilePath);
      
      const transcription = await this._client.audio.transcriptions.create({
        model: "whisper-1",
        file: audioFile,
        language: "pt"
      });
      
      const textContent = transcription.text;
      
      if (!textContent) {
        logger.warn("Failed to transcribe audio content");
        throw new Error("Failed to transcribe audio content");
      }
      
      logger.info("Audio transcribed successfully");
      return textContent;
    } catch (error) {
      logger.error(`Whisper transcription error: ${error}`);
      throw new Error(`Speech-to-text transcription failed: ${error.message}`);
    }
  }
}

module.exports = { OpenAIClient };