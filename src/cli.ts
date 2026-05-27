import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { loadConfig } from "./config.js"
import { backfillTranscripts, runUserPromptSubmitHook, syncStateMetadata } from "./backfill.js"
import { sessionPathsForAll, sessionPathsForDate } from "./hook-input.js"
import { installDirect } from "./install-direct.js"
import { provisionDataSource } from "./notion.js"
import { runDoctor } from "./doctor.js"

const version = "0.1.0"

const dryRunFlag = Flag.boolean("dry-run").pipe(Flag.withDefault(false))
const noNotionFlag = Flag.boolean("no-notion").pipe(Flag.withDefault(false))
const summaryFlag = Flag.boolean("summary").pipe(Flag.withDefault(false))

const doctorCommand = Command.make(
  "doctor",
  {
    dryRun: dryRunFlag,
  },
  ({ dryRun }) => runJson(() => runDoctor(loadConfig(), { dryRun })),
)

const setupNotionCommand = Command.make(
  "setup-notion",
  {
    dryRun: dryRunFlag,
  },
  ({ dryRun }) =>
    runJson(async () => {
      const config = loadConfig()
      if (dryRun) {
        const report = await runDoctor(config, { dryRun: true })
        return { dryRun: true, notionSchema: report.notionSchema }
      }
      return provisionDataSource(config)
    }),
)

const installDirectCommand = Command.make("install-direct", {}, () =>
  runJson(() => Promise.resolve(installDirect(loadConfig()))),
)

const syncStateMetadataCommand = Command.make(
  "sync-state-metadata",
  {
    dryRun: dryRunFlag,
    noNotion: noNotionFlag,
  },
  ({ dryRun, noNotion }) =>
    runJson(async () => {
      const updatedStateOnlyMetadata = await syncStateMetadata(loadConfig(), { dryRun, noNotion })
      return { updatedStateOnlyMetadata }
    }),
)

const backfillCommand = Command.make(
  "backfill",
  {
    all: Flag.boolean("all").pipe(Flag.withDefault(false)),
    date: Flag.string("date").pipe(Flag.withDefault("")),
    dryRun: dryRunFlag,
    noNotion: noNotionFlag,
    summary: summaryFlag,
  },
  ({ all, date, dryRun, noNotion, summary }) =>
    runJson(async () => {
      const config = loadConfig()
      const paths = all ? sessionPathsForAll(config) : sessionPathsForDate(config, date)
      if (!all && !date) throw new Error("backfill requires --all or --date YYYY-MM-DD")
      return backfillTranscripts(config, paths, all ? "all" : date, { dryRun, noNotion, summary })
    }),
)

const userPromptSubmitCommand = Command.make(
  "user-prompt-submit",
  {
    dryRun: dryRunFlag,
    noNotion: noNotionFlag,
  },
  ({ dryRun, noNotion }) =>
    runJson(() => runUserPromptSubmitHook(loadConfig(), { dryRun, noNotion })),
)

const hookCommand = Command.make("hook").pipe(Command.withSubcommands([userPromptSubmitCommand]))

const rootCommand = Command.make("cci").pipe(
  Command.withSubcommands([
    doctorCommand,
    setupNotionCommand,
    installDirectCommand,
    backfillCommand,
    syncStateMetadataCommand,
    hookCommand,
  ]),
)

export function runCli(): void {
  NodeRuntime.runMain(
    Command.run({ version })(rootCommand).pipe(Effect.provide(NodeServices.layer)),
  )
}

function runJson(action: () => Promise<unknown>): Effect.Effect<void, Error> {
  return Effect.tryPromise(action).pipe(
    Effect.flatMap((value) => Console.log(JSON.stringify(value, null, 2))),
  )
}
