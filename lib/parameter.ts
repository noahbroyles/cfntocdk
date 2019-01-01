import { JSONMap, Construct } from "./types";
import Options from "./options";
import codemaker = require("codemaker");

export default class Parameter implements Construct {
  data: JSONMap;
  name: string;

  static known: Array<string> = [];

  static isParameter(name: string): boolean {
    return this.known.findIndex(a => a === name) != -1;
  }

  constructor(name: string, data: JSONMap) {
    this.data = data;
    this.name = name;
    Parameter.known.push(name);
  }

  compile(): string {
    return `const ${codemaker.toCamelCase(
      this.name
    )} = new cdk.Parameter(this, "${this.name}", 
      ${new Options(this.data).compile()}
    );
    
    `;
  }
}
