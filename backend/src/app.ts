import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  // Domain routes (auth, vehicles, rides, driver) are mounted here as they
  // land -- see feature/passenger-auth, feature/tesla-pooling, etc.

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  // Centralized error handler -- keeps error shaping out of every route.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  });

  return app;
}
