import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { HttpError } from "./lib/errors";
import { authRouter } from "./modules/auth/auth.routes";

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);

  // Further domain routes (vehicles, rides, driver) are mounted here as they
  // land -- see feature/tesla-pooling, feature/driver-flow, etc.

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
