import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(__dirname, "../.env.test") });

jest.setTimeout(30_000);
