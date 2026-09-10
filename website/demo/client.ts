import { workerDetail } from "./data";

// The demo resolves subagent details from fixtures, never from the local service.
export async function fetchSubagentThread(threadId: string) {
  if (threadId !== workerDetail.thread.id)
    throw new Error("Unknown demo subagent");
  return workerDetail;
}
