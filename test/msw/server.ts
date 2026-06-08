import type { HttpHandler } from "msw";
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);

export function useMswHandlers(...runtimeHandlers: HttpHandler[]) {
  server.use(...runtimeHandlers);
}
