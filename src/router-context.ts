import type { QueryClient } from "@tanstack/react-query";

export type RouterContext = {
  queryClient: QueryClient;
};

export type RouteLoaderArgs<TParams = Record<string, never>> = {
  context: RouterContext;
  params: TParams;
};
