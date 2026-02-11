import { ZodError } from "zod";

export function formatZodError(error: ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors;
}
