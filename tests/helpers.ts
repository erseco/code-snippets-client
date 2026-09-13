import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
export async function server(
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
  ) => unknown | Promise<unknown>,
) {
  const http = createServer((req, res) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(http.address() as AddressInfo).port}`,
    close: async () => {
      http.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        http.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
export function json(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}
export async function body(req: IncomingMessage) {
  let text = "";
  for await (const chunk of req) text += String(chunk);
  return text;
}
export const sample = {
  id: 7,
  name: "Demo",
  code: "old\n",
  desc: "Keep",
  scope: "global",
  priority: 8,
  tags: ["keep"],
  active: true,
  network: false,
  trashed: false,
  code_error: null,
};
