// lib/adapters.ts
 import { greenhouseAdapter } from "../adapters/greenhouse";
import { webAdapter } from "../adapters/web";

type GreenhouseFn = (tenant_slug: string, external_job_id: string) => Promise<any>;
type WebFn = (url: string) => Promise<any>;

export type AdaptersRegistry = {
  greenhouse?: GreenhouseFn;
  web?: WebFn;
};

export const adapters: AdaptersRegistry = {
  greenhouse: greenhouseAdapter,
  web: webAdapter,
};

export { greenhouseAdapter, webAdapter };