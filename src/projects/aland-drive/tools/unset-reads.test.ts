import { describe, expect, it } from "vitest";
import { unsetReads } from "./unset-reads.mjs";

/** A fragment main in three's shape: declarations at the top, the flow below. */
const shader = (flow: string) => `
var nodeVar0 : f32;
var nodeVar1 : f32;
var nodeVar2 : f32;

@fragment
fn main( @location( 0 ) v : f32 ) -> OutputStruct {
${flow}
	return output;
}
`;

const names = (code: string) => unsetReads(code).map(({ name }) => name);

describe("unsetReads", () => {
  it("flags a variable assigned in one branch and read in another, or after it", () => {
    const code = shader(`
	if ( v > 0.0 ) {
		nodeVar0 = v * 2.0;
		nodeVar1 = nodeVar0;
	} else {
		nodeVar1 = ( 1.0 - nodeVar0 );
	}
	nodeVar2 = nodeVar1;
	if ( v > 1.0 ) {
		nodeVar2 = nodeVar0;
	}
`);
    expect(names(code)).toEqual(["nodeVar0", "nodeVar0"]);
  });

  it("counts a variable assigned on both sides of an if and else as assigned after them, through nested ones", () => {
    const code = shader(`
	if ( v > 0.0 ) {
		nodeVar0 = 1.0;
	} else {
		if ( v > 1.0 ) {
			nodeVar1 = 2.0;
		} else {
			nodeVar1 = 3.0;
		}
		nodeVar0 = nodeVar1;
	}
	nodeVar2 = nodeVar0;
`);
    expect(names(code)).toEqual([]);
  });

  it("flags a read after an if with no else, and reads inside a branch of what only a sibling set", () => {
    const code = shader(`
	if ( v > 0.0 ) {
		nodeVar0 = 1.0;
	}
	nodeVar1 = nodeVar0;
	if ( v > 1.0 ) {
		nodeVar2 = 4.0;
	}
	if ( v > 2.0 ) {
		nodeVar1 = nodeVar2;
	}
`);
    expect(names(code)).toEqual(["nodeVar0", "nodeVar2"]);
  });

  it("keeps each main function's variables apart, and reads nothing in a declaration", () => {
    const code = shader("\tnodeVar0 = v;\n") + shader("\tnodeVar1 = nodeVar0;\n");
    expect(unsetReads(code)).toEqual([{ fn: 1, line: 2, name: "nodeVar0", text: "nodeVar1 = nodeVar0;" }]);
  });
});
