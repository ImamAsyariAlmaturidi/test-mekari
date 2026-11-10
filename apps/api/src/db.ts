import pg from "pg";
import { env } from "./config.js";

export const db = new pg.Pool({ connectionString: env.DATABASE_URL });

export const vector = (values: number[]) => `[${values.join(",")}]`;
