import { describe, test, expect, vi, beforeEach, afterEach} from "vitest";
import { ConfigManager, mapConfig, nameToEnv } from  "../../ConfigManager.js" //"../src/config";

const defaultCfg = ConfigManager.config(process.cwd())

// const defaultCfg = {
//   verbose: false,
//   locale: "en-US",
//   paths: {
//     out: "data/raw/",
//     sources: "data/sources/",
//     sql: "data/sql/",
//   },
//   sparql: { rateLimitMs: 1000 },

// };
let originalArgv : any
beforeEach(() => {
  originalArgv = process.argv
  // to satisfy config policy
  process.argv.push("--paths.out", "./");
})

afterEach(() => {
  process.argv = originalArgv
})
describe("nameToEnv()", () => {
  it("should convert simple variable to CONSTANT_CASE", () => {
    expect(nameToEnv("variable")).toBe("VARIABLE");
    expect(nameToEnv("myVariable")).toBe("MY_VARIABLE");
    expect(nameToEnv("db.port")).toBe("DB_PORT");
    expect(nameToEnv("userProfile.idNumber")).toBe("USER_PROFILE_ID_NUMBER");
  });
});

describe("mapConfig()", () => {
  const OLD_ENV = process.env;
  let originalArgv: string[];

  // beforeEach(() => {
  //   vi.resetModules();
  //   process.env = { ...OLD_ENV };
  //   originalArgv = process.argv;
  //   process.argv = ["node", "test"];
  // });

  // afterEach(() => {
  //   process.env = OLD_ENV;
  //   process.argv = originalArgv;
  // });

  it("should return defaults when no env or cmdline provided", () => {
    const cfg = mapConfig();
    expect(cfg.locale).toBe(defaultCfg.locale);
    expect(cfg.verbose).toBe(false);
  });

  it("should override with command line args (string/number)", () => {
    process.argv = ["node", "test", "--sparql.rateLimitMs", "3000", "--locale", "ca-ES"];
    const cfg = mapConfig();
    expect(cfg.sparql.rateLimitMs).toBe(3000);
    expect(cfg.locale).toBe("ca-ES");
  });

  it("should support camelCase CLI args", () => {
    process.argv = ["node", "test", "--sparql.rateLimitMs", "4000"];
    const cfg = mapConfig();
    expect(cfg.sparql.rateLimitMs).toBe(4000);
  });

  it("should preserve _args for unrecognized CLI args", () => {
    process.argv = ["node", "test", "--unknownFlag", "foo", "--extra.option", "bar"];
    const cfg = mapConfig();
    expect(cfg._args).toBeDefined();
    expect(cfg._args.unknownFlag).toBe("foo");
    expect(cfg._args.extra.option).toBe("bar");
  });

  it("should prioritize CLI over ENV over defaults", () => {
    process.env["LOCALE"] = "es-ES";
    process.argv = ["node", "test", "--locale", "ca-ES"];
    const cfg = mapConfig();
    expect(cfg.locale).toBe("ca-ES"); // CLI wins
  });

  it("should handle boolean CLI args", () => {
    process.argv = ["node", "test", "--verbose"];
    const cfg = mapConfig();
    expect(cfg.verbose).toBe(true);

    process.argv = ["node", "test", "--no-verbose"];
    const cfg2 = mapConfig();
    expect(cfg2.verbose).toBe(false);

    process.argv = ["node", "test", "--verbose", "false"];
    const cfg3 = mapConfig();
    expect(cfg3.verbose).toBe(false);
  });

  it("should capture simple rogue args", () => {
    process.argv = ["node", "test", "--rogueArg", "foo"];
    const cfg = mapConfig();
    expect(cfg._args).toBeDefined();
    expect(cfg._args.rogueArg).toBe("foo");
  });

 

  it("should capture complex rogue args (dot notation)", () => {
    process.argv = ["node", "test", "--complex.id", "baz"];
    const cfg = mapConfig();
    expect(cfg._args.complex.id).toBe("baz");
  });
});
