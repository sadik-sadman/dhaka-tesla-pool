import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { HttpError } from "./lib/errors";
import { authRouter } from "./modules/auth/auth.routes";
import { zonesRouter } from "./modules/zones/zones.routes";
import { ridesRouter } from "./modules/rides/rides.routes";
import { driverRouter } from "./modules/driver/driver.routes";

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  // Skipped under test -- Jest's own output is noisy enough already, and
  // these requests aren't real traffic anyone needs an access log for.
  if (process.env.NODE_ENV !== "test") {
    app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
  }
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/zones", zonesRouter);
  app.use("/api/rides", ridesRouter);
  app.use("/api/driver", driverRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  // Centralized error handler -- keeps error shaping out of every route.
  // A thrown HttpError (see src/lib/errors.ts) carries its own status code;
  // anything else is an unexpected bug, logged and reported as a 500.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
