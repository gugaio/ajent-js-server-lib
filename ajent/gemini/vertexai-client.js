const { LLMClient } = require('../llm-client');
const { ResponseSerializer } = require('../response-serializer');
const fs = require('fs');
const logger = require('../utils/logger');
const { VertexAI, FunctionDeclarationSchemaType } = require('@google-cloud/vertexai');
//const speech = require('@google-cloud/speech');

process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS || '/home/gugaime/Documents/GCP/ajent-445416-b207df6c42cf.json';

class VertexAIClient extends LLMClient {
  constructor(projectId, location = 'us-central1', model = 'gemini-2.5-flash-preview-05-20') {
    super();
    this.vertexAi = new VertexAI({ project: projectId, location });
    this.model = this.vertexAi.getGenerativeModel({ model });
  }

  // Convert OpenAI-style tools to Gemini function_declarations
  convertTools(tools) {
    if (!tools) return [];

    return tools.map(tool => ({
      function_declarations: tool.function_declarations.map(func => ({
        name: func.name,
        description: func.description,
        parameters: func.parameters,
      }))
    }));
  }

  convertMessages(messages) {
    return messages.map(msg => {
      const parts = [];

      if (msg.function_call) {
        parts.push({
          functionCall: {
            name: msg.function_call.name,
            args: msg.function_call.arguments,
          },
        });
      } else if (msg.tool_calls) {
        parts.push(...msg.tool_calls.map(tc => ({
          functionCall: {
            name: tc.function.name,
            args: JSON.parse(tc.function.arguments),
          },
        })));
      } else if (msg.content) {
        parts.push({ text: msg.content });
      }

      return {
        role: msg.role.toLowerCase() === 'assistant' ? 'model' : 'user',
        parts,
      };
    });
  }

  async send(messages, tools) {
    try {
      const request = {
        contents: this.convertMessages(messages),
        tools: this.convertTools(tools),
      };

      const response = await this.model.generateContent(request);
      const part = response.response?.candidates?.[0]?.content?.parts?.[0];

      return this.serializeResponse({ role: 'model', content: part?.text });
    } catch (error) {
      logger.error(`Vertex AI error: ${error}`);
      return { error: 'Vertex AI error', details: error.message };
    }
  }

  async stream(messages, tools, model) {
    try {
      const request = {
        contents: this.convertMessages(messages),
        tools: this.convertTools(tools),
      };

      const stream = await this.model.generateContentStream(request);
      let currentToolCalls = {};
      let currentContent = '';

      return {
        [Symbol.asyncIterator]: async function* () {
          try {
            for await (const chunk of stream.stream) {
              const candidate = chunk.candidates?.[0];
              const part = candidate?.content?.parts?.[0];

              // Handle function call
              if (part?.functionCall) {
                const { name, args } = part.functionCall;
                yield {
                  type: 'tool_call',
                  tool_call: {
                    id: name,
                    type: 'function',
                    function: {
                      name,
                      arguments: JSON.stringify(args),
                    },
                  },
                };
              }

              // Handle text content
              if (part?.text) {
                currentContent += part.text;
                yield {
                  type: 'content',
                  content: part.text,
                };
              }
            }

            yield {
              type: 'finish',
              final_content: currentContent,
              final_tool_calls: Object.values(currentToolCalls).length > 0 ? Object.values(currentToolCalls) : null,
              finish_reason: 'stop',
            };
          } catch (error) {
            logger.error(`Error in stream: ${error}`);
            yield { error: 'Stream error', details: error.message };
          }
        },
      };
    } catch (error) {
      logger.error(`Error starting stream: ${error}`);
      return {
        [Symbol.asyncIterator]: async function* () {
          yield { error: 'Stream initialization error', details: error.message };
        },
      };
    }
  }

  /*async stt(audioFilePath) {
    try {
      const client = new speech.SpeechClient();
      const audioBytes = fs.readFileSync(audioFilePath).toString('base64');

      const [response] = await client.recognize({
        audio: { content: audioBytes },
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: 'pt-BR',
        },
      });

      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

      if (!transcription) {
        throw new Error('No transcription returned');
      }

      logger.info('Audio transcribed successfully');
      return transcription;
    } catch (error) {
      logger.error(`STT error: ${error}`);
      throw new Error(`STT failed: ${error.message}`);
    }
  }*/

  serializeResponse(response) {
    return ResponseSerializer.serializeMessage(response);
  }
}

module.exports = { VertexAIClient };
