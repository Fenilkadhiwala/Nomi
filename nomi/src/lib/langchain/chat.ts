import { ChatBedrockConverse } from "@langchain/aws";

export const llm = new ChatBedrockConverse({
  model: "amazon.nova-lite-v1:0",
  region: process.env.AWS_DEFAULT_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESSKEY!,
    secretAccessKey: process.env.AWS_SECRET_ACCESSKEY!,
  },
});
