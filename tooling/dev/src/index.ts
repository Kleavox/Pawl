interface Env {
  PAWL: Fetcher;
}

export default {
  fetch: (request: Request, env: Env) => env.PAWL.fetch(request),
};
