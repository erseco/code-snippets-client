#!/usr/bin/env node
import { runCli } from "./cli.js";
import { CodeSnippetsError } from "./errors.js";
try {
  const result = await runCli(process.argv.slice(2));
  process.stdout.write(
    typeof result === "string"
      ? result
      : JSON.stringify(result, null, 2) + "\n",
  );
} catch (error) {
  const safe =
    error instanceof CodeSnippetsError
      ? { code: error.code, message: error.message, status: error.status }
      : {
          code: "CLI",
          message: "Invalid arguments, input file or environment; use --help",
        };
  process.stderr.write(JSON.stringify({ error: safe }) + "\n");
  process.exitCode = 1;
}
