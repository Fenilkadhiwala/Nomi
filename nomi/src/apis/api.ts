export const getAIResponseStream = async (
  message: string,
  senderId: any,
  threadId: any,
) => {
  const response = await fetch("http://localhost:3000/api/get-ai-response", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, senderId, threadId }),
  });
  return response.json();
};
