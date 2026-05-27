import * as esbuild from "esbuild"
import fs from "node:fs"

fs.rmSync("dist", { recursive: true, force: true })

await esbuild.build({
  entryPoints: ["bin/cci.ts"],
  outfile: "dist/cci.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: false,
})

fs.chmodSync("dist/cci.cjs", 0o755)
