import { getMapFromPaths } from './utils';
import { JSCodeAnalyzer } from "../src/JSCodeAnalyzer";


describe("JSCodeAnalyzer", () => {
	test("simple", () => {
		let analyzer = new JSCodeAnalyzer();
		let tree = analyzer.parse(getMapFromPaths([`${__dirname}/data/simple.js`]));
		expect(tree.rootNodes.length).toBe(1);
		let fileNode = tree.rootNodes[0];
		expect(fileNode.type).toBe("File");
		expect(fileNode.children.length).toBe(2);
		expect(fileNode.children[0].type).toBe("Function");
		expect(fileNode.children[0].localName).toBe("func1");
		expect(fileNode.children[1].type).toBe("Function");
		expect(fileNode.children[1].localName).toBe("func2");		
	});
});
