import { LLMClient } from '../llm-client';
import { ResponseSerializer } from '../response-serializer';
import OpenAI from 'openai';
import fs from 'fs';
import logger from '../utils/logger';

class OpenAIClient extends LLMClient {
  constructor(token) {
    super();
    this._client = new OpenAI({ apiKey: token });
  }

  async send(messages, tools, model) {
    try {
      const response = await this._client.chat.completions.create({
        model: model,
        messages: messages,
        tools: tools
      });
      
      const message = response.choices[0].message;
      return this.serializeResponse(message);
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        logger.error(`OpenAI API error: ${error}`);
        return { error: "OpenAI API error", details: error.message };
      } else if (error instanceof OpenAI.RateLimitError) {
        logger.warn("Rate limit exceeded. Please slow down your requests.");
        return { error: "Rate limit exceeded", details: error.message };
      } else if (error instanceof OpenAI.InvalidRequestError) {
        logger.error(`Invalid request: ${error}`);
        return { error: "Invalid request", details: error.message };
      } else if (error instanceof OpenAI.AuthenticationError) {
        logger.error(`Authentication error: ${error}`);
        return { error: "Authentication error", details: error.message };
      } else if (error instanceof OpenAI.OpenAIError) {
        logger.error(`General OpenAI error: ${error}`);
        return { error: "OpenAI error", details: error.message };
      } else {
        logger.error(`Unexpected error occurred: ${error}`);
        return { error: "Unexpected error", details: error.message };
      }
    }
  }

  serializeResponse(response) {
    return ResponseSerializer.serializeMessage(response);
  }

  async stream(messages, tools, model) {
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