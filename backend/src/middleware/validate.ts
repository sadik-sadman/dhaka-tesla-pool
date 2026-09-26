import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";
import { BadRequestError } from "../lib/errors";

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      throw new BadRequestError(message);
    }
    req.body = result.data;
    next();
  };
}

// Express types req.params values as `string | string[]` (an array only
// applies to wildcard segments like `/*splat`, never a plain `:id`), so a
// route handler can't pass req.params.id straight to a `string`-typed
// service function without narrowing it somewhere -- here, once, instead of
// in every handler that reads a path param.
export function requireStringParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string") {
    throw new BadRequestError(`Missing path parameter: ${name}`);
  }
  return value;
}
