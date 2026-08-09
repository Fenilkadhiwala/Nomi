import { AmazonKnowledgeBaseRetriever } from "@langchain/aws";

export const retriever = new AmazonKnowledgeBaseRetriever({
  knowledgeBaseId: process.env.AWS_KNOWLEDGE_BASE_ID!,
  region: process.env.AWS_DEFAULT_REGION!,
  topK: 5,
});
