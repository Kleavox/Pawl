import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pawl = path.resolve(here, "..", "..");
const siblings = process.env.SIBLINGS
  ? path.resolve(process.env.SIBLINGS)
  : path.resolve(pawl, "..");

export const SIBLING_REPOS = {
  desmyx: path.join(siblings, "desmyx"),
};

export const WORKER_SOURCE = {
  pass: "local",
  gateway: "local",
  link: SIBLING_REPOS.desmyx,
};
