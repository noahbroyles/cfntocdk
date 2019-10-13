import CdkToCFN from "./index";
import fs = require("fs");
import testUtil = require("@aws-cdk/core/test/util");
import * as ts from "typescript";
import { toPascal } from "./lib/util";

const integrationExamples = ["buildkite", "WordPress_Multi_AZ"];

function rmF(filename: string) {
  if (fs.existsSync(filename)) fs.unlinkSync(filename);
}

for (let stack of integrationExamples) {
  const cfnSrc = `./__fixtures__/${stack}.json`;
  const tsOutput = `./tmp/${stack}.ts`;
  const jsOutput = `./tmp/${stack}.js`;
  const jsonOutput = `./tmp/${stack}.json`;

  test(`Stack ${cfnSrc} compiles to ${tsOutput}`, () => {
    const cfn = fs.readFileSync(cfnSrc).toString();
    rmF(tsOutput);

    const cdk = new CdkToCFN(stack, cfn).compile();
    fs.writeFileSync(tsOutput, cdk);

    expect(fs.readFileSync(tsOutput).toString()).toMatchSnapshot();
  });

  test(`CDK TS ${tsOutput} transpiles to CDK JS ${jsOutput}`, () => {
    if (!fs.existsSync(tsOutput)) return;
    const cdk = fs.readFileSync(tsOutput).toString();
    rmF(jsOutput);

    const js = ts.transpileModule(cdk, {
      reportDiagnostics: true,
      fileName: `${stack}.ts`,
      compilerOptions: {
        target: ts.ScriptTarget.ES2015,
        module: ts.ModuleKind.CommonJS,
        strict: true,
        sourceMap: false
      }
    });
    fs.writeFileSync(jsOutput, js.outputText);
  });

  test(`CDK JS ${jsOutput} renders to CFN ${jsonOutput} and matches original stack ${cfnSrc}`, () => {
    if (!fs.existsSync(jsOutput)) return;
    const cdkmodule = require(jsOutput);
    rmF(jsonOutput);
    const cdkstack = new cdkmodule[`${toPascal(stack)}Stack`]();
    const output = testUtil.toCloudFormation(cdkstack);

    fs.writeFileSync(jsonOutput, JSON.stringify(output, null, 2));
    expect(output).toMatchSnapshot();

    const original = JSON.parse(fs.readFileSync(cfnSrc).toString());
    expect(output).toEqual(original);
  });
}
