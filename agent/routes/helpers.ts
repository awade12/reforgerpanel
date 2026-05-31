import type http from "http";
import { redactInstanceForPanel } from "../../lib/shared/secrets";
import { isPanelClient } from "../panel-request";
import { sendJson } from "../http";
import type { InstanceWithConfig } from "../../lib/shared/types";

export function respondInstance(
  res: http.ServerResponse,
  req: http.IncomingMessage,
  item: InstanceWithConfig | null,
  status = 200,
) {
  if (!item) return sendJson(res, 404, { error: "Not found" });
  return sendJson(res, status, isPanelClient(req) ? redactInstanceForPanel(item) : item);
}

export function respondInstanceAction(
  res: http.ServerResponse,
  req: http.IncomingMessage,
  result: { instance: InstanceWithConfig; warnings?: string[] },
) {
  return sendJson(res, 200, {
    ...result,
    instance: isPanelClient(req) ? redactInstanceForPanel(result.instance) : result.instance,
  });
}
