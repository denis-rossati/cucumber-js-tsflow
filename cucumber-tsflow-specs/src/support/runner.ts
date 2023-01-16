// Adapted from:
// https://github.com/cucumber/cucumber-js/blob/6505e61abce385787767f270b6ce2077eb3d7c1c/features/support/world.ts
import * as messageStreams from "@cucumber/message-streams";
import * as messages from "@cucumber/messages";
import assert from "assert";
import { execFile } from "child_process";
import expect from "expect";
import fs from "fs";
import path from "path";
import { pipeline, Writable } from "stream";
import stripAnsi from "strip-ansi";
import util from "util";
import VError from "verror";
import { Extractor } from "./helpers";
import { TestDir } from "./testDir";

const projectPath = path.join(__dirname, "..", "..", "..");
const cucumberBinPath = path.join(projectPath, "node_modules", ".bin", "cucumber-js");

const asyncPipeline = util.promisify(pipeline);

interface IRunResult {
  error: any;

  stderr: string;

  stdout: string;
}

interface ILastRun {
  error: any;

  errorOutput: string;

  envelopes: messages.Envelope[];

  output: string;
}

export class TestRunner {
  public readonly dir = new TestDir();

  public sharedEnv?: NodeJS.ProcessEnv;

  public spawn: boolean = false;

  public debug: boolean = false;

  public worldParameters?: any;

  public verifiedLastRunError!: boolean;

  private _lastRun?: ILastRun;

  public get lastRun(): ILastRun {
    assert(this._lastRun, "Cucumber has not executed yet.");
    return this._lastRun;
  }

  public get extractor(): Extractor {
    return new Extractor(this.lastRun.envelopes)
  }

  public async run(envOverride: NodeJS.ProcessEnv | null = null): Promise<void> {
    const messageFilename = "message.ndjson";
    const env = { ...process.env, ...this.sharedEnv, ...envOverride };

    const result = await new Promise<IRunResult>((resolve) => {
      execFile(
        "node",
        [
          cucumberBinPath,
          "--format", `message:${messageFilename}`,
          "--require-module", "ts-node/register",
          "--require", "step_definitions/**/*.ts",
          "--publish-quiet"
        ],
        { cwd: this.dir.path, env },
        (error, stdout, stderr) => {
          resolve({ error, stdout, stderr });
        }
      );
    });

    const stderrSuffix = result.error != null
      ? VError.fullStack(result.error)
      : "";

    const envelopes: messages.Envelope[] = [];
    const messageOutputPath = this.dir.getPath(messageFilename);
    if (fs.existsSync(messageOutputPath)) {
      await asyncPipeline(
        fs.createReadStream(messageOutputPath, { encoding: "utf-8" }),
        new messageStreams.NdjsonToMessageStream(),
        new Writable({
          objectMode: true,
          write(envelope: messages.Envelope, _: BufferEncoding, callback) {
            envelopes.push(envelope);
            callback();
          }
        })
      );
    }

    this._lastRun = {
      error: result.error,
      errorOutput: result.stderr + stderrSuffix,
      envelopes,
      output: stripAnsi(result.stdout)
    };
    this.verifiedLastRunError = false;

    expect(this._lastRun.output).not.toContain("Unhandled rejection.");
  }
}