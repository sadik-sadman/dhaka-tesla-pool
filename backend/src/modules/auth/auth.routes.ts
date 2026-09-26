import { Router } from "express";
import { signupSchema, loginSchema } from "./auth.schema";
import { validateBody } from "../../middleware/validate";
import { requireAuth } from "../../middleware/auth";
import { NotFoundError } from "../../lib/errors";
import * as authService from "./auth.service";

export const authRouter = Router();

// Express 5 forwards a rejected promise from an async handler to the error
// middleware automatically -- no manual try/catch + next(err) needed here.

authRouter.post("/signup", validateBody(signupSchema), async (req, res) => {
  const result = await authService.signup(req.body);
  res.status(201).json(result);
});

authRouter.post("/login", validateBody(loginSchema), async (req, res) => {
  const result = await authService.login(req.body);
  res.status(200).json(result);
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await authService.getById(req.user!.sub);
  if (!user) {
    throw new NotFoundError("User not found");
  }
  res.status(200).json(user);
});
