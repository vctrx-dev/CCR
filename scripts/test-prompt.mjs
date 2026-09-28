/** Load current TypeScript sources without stale dist output, a build, or an LLM call. */
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: false,
  logLevel: "silent",
  server: { middlewareMode: true, watch: null },
  appType: "custom",
});
try {
  const { renderPromptPreview } = await server.ssrLoadModule("/src/review/prompt-preview.ts");
  process.stdout.write(renderPromptPreview(process.argv.slice(2)));
} catch {
  process.stderr.write(
    "Cannot render prompt. Run pnpm test:prompt without arguments; check source syntax and a nonempty taxonomy.\n",
  );
  process.exitCode = 1;
} finally {
  await server.close();
}
