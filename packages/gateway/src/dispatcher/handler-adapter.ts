import type { MessageHandler, MessageRequest, MessageResponse } from "../types";
import type { DispatchRequest, Dispatcher, RequestSource } from "./types";

export function createDispatcherHandler(
  dispatcher: Dispatcher,
  source: RequestSource,
): MessageHandler {
  return {
    async handle(request: MessageRequest): Promise<MessageResponse> {
      const dispatchRequest: DispatchRequest = {
        ...request,
        source,
        priority: getSourcePriority(source),
        requestId: generateRequestId(),
      };

      return dispatcher.dispatch(dispatchRequest);
    },
  };
}

function getSourcePriority(source: RequestSource): number {
  const priorities: Record<RequestSource, number> = {
    discord: 10,
    http: 10,
    terminal: 10,
    cron: 5,
    heartbeat: 1,
  };
  return priorities[source];
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
