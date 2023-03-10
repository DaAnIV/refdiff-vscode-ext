import { CST } from '../CST/CST';
import { CSTNode } from '../CST/CSTNode';
import { TokenizedFile } from '../CST/TokenizedFile';
import { Multiset } from './Multiset';

export class CodeSimiliarity {
    private nodesTokens: Map<CSTNode, Multiset<string>>;
    private nodesNamesTokens: Map<CSTNode, Multiset<string>>;
    private nodesBodyTokens: Map<CSTNode, Multiset<string>>;
    private idfPerToken: Map<string, number>;
    private idfPerNameToken: Map<string, number>;

    constructor(
        before: CST,
        after: CST,
        beforeFiles: Map<string, Buffer>,
        afterFiles: Map<string, Buffer>
    ) {
        this.nodesTokens = new Map<CSTNode, Multiset<string>>();
        this.nodesNamesTokens = new Map<CSTNode, Multiset<string>>();
        this.nodesBodyTokens = new Map<CSTNode, Multiset<string>>();
        this.idfPerToken = new Map<string, number>();
        this.idfPerNameToken = new Map<string, number>();

        let treeTokensBefore = new Multiset<string>();
        let treeTokensAfter = new Multiset<string>();
        let treeNameTokensBefore = new Multiset<string>();
        let treeNameTokensAfter = new Multiset<string>();

        let elemntsCountBefore = this.addTree(
            before,
            beforeFiles,
            treeTokensBefore,
            treeNameTokensBefore
        );
        let elemntsCountAfter = this.addTree(
            after,
            afterFiles,
            treeTokensAfter,
            treeNameTokensAfter
        );

        let treeTokens = Multiset.max(treeTokensBefore, treeTokensAfter);
        let treeNameTokens = Multiset.max(
            treeNameTokensBefore,
            treeNameTokensAfter
        );
        let elemntsCount = Math.max(elemntsCountBefore, elemntsCountAfter);

        treeTokens.forEach((count, token) => {
            this.idfPerToken.set(token, Math.log(1 + elemntsCount / count));
        });
        treeNameTokens.forEach((count, token) => {
            this.idfPerNameToken.set(token, Math.log(1 + elemntsCount / count));
        });
    }

    private addTree(
        tree: CST,
        fileContents: Map<string, Buffer>,
        treeTokens: Multiset<string>,
        treeNameTokens: Multiset<string>
    ): number {
        let elemntsCount = 0;
        for (let node of tree) {
            this.addNode(tree, node, fileContents, treeTokens);
            this.addNodeName(node, treeNameTokens);
            elemntsCount++;
        }

        return elemntsCount;
    }

    private addNode(
        tree: CST,
        node: CSTNode,
        fileContents: Map<string, Buffer>,
        treeTokens: Multiset<string>
    ) {
        let tokenizedFile = tree.tokenizedFiles.get(
            node.location.file
        ) as TokenizedFile;
        let fileContent = fileContents.get(tokenizedFile.file) as Buffer;
        let nodeTokens = new Multiset<string>();
        let nodeBodyTokens = new Multiset<string>();
        let hasBody = node.location.bodyBegin !== node.location.begin;

        for (let token of tokenizedFile.tokens) {
            if (token.start < node.location.begin) {
                continue;
            }
            if (token.end > node.location.end) {
                break;
            }
            let tokenStr = fileContent.toString(
                'ascii',
                token.start,
                token.end
            );
            nodeTokens.add(tokenStr);
            if (
                hasBody &&
                token.start >= node.location.bodyBegin &&
                token.end <= node.location.bodyEnd
            ) {
                nodeBodyTokens.add(tokenStr);
            }
        }

        nodeTokens.forEach((_, key) => {
            treeTokens.add(key);
        });
        this.nodesTokens.set(node, nodeTokens);
        if (hasBody) {
            this.nodesBodyTokens.set(node, nodeBodyTokens);
        }
    }

    private addNodeName(node: CSTNode, treeTokens: Multiset<string>) {
        let nodeTokens = new Multiset<string>();

        let curNode: CSTNode | undefined;

        for (curNode = node; curNode !== undefined; curNode = curNode?.parent) {
            this.splitName(node.localName).forEach((token) => {
                nodeTokens.add(token);
            });
        }
        this.nodesNamesTokens.set(node, nodeTokens);

        nodeTokens.forEach((_, key) => {
            treeTokens.add(key);
        });
    }

    private splitName(name: string): Array<string> {
        let tokens = new Array<string>();
        let word = '';
        for (let c of name) {
            if (c.toUpperCase() === c) {
                tokens.push(word);
                word = '';
            }
            word += c;
        }
        tokens.push(word);
        return tokens;
    }

    public sim(node1: CSTNode, node2: CSTNode): number {
        let multiset1 = this.nodesTokens.get(node1) as Multiset<string>;
        let multiset2 = this.nodesTokens.get(node2) as Multiset<string>;
        return CodeSimiliarity.calculateWJC(
            this.idfPerToken,
            multiset1,
            multiset2
        );
    }

    public bodySim(node1: CSTNode, node2: CSTNode): number {
        let multiset1 = this.nodesBodyTokens.get(node1) as Multiset<string>;
        let multiset2 = this.nodesBodyTokens.get(node2) as Multiset<string>;
        return CodeSimiliarity.calculateWJC(
            this.idfPerToken,
            multiset1,
            multiset2
        );
    }

    public nameSim(node1: CSTNode, node2: CSTNode): number {
        let multiset1 = this.nodesNamesTokens.get(node1) as Multiset<string>;
        let multiset2 = this.nodesNamesTokens.get(node2) as Multiset<string>;
        return CodeSimiliarity.calculateWJC(
            this.idfPerNameToken,
            multiset1,
            multiset2
        );
    }

    public extractedSim(
        beforeNode: CSTNode,
        afterNode: CSTNode,
        extractedNode: CSTNode
    ): number {
        let beforeMultiset = this.nodesBodyTokens.get(
            beforeNode
        ) as Multiset<string>;
        let afterMultiset = this.nodesBodyTokens.get(
            afterNode
        ) as Multiset<string>;
        let extractedMultiset = this.nodesBodyTokens.get(
            extractedNode
        ) as Multiset<string>;

        let omittedKeys: Set<string> = new Set<string>();
        omittedKeys.add('return');
        beforeNode.parameters.forEach((param) => {
            omittedKeys.add(param);
        });
        afterNode.parameters.forEach((param) => {
            omittedKeys.add(param);
        });

        return CodeSimiliarity.calculateContainedWJC(
            this.idfPerToken,
            extractedMultiset.removeKeys(omittedKeys),
            beforeMultiset.sub(afterMultiset).removeKeys(omittedKeys)
        );
    }

    public inlineSim(
        beforeNode: CSTNode,
        afterNode: CSTNode,
        inlinedNode: CSTNode
    ): number {
        let beforeMultiset = this.nodesBodyTokens.get(
            beforeNode
        ) as Multiset<string>;
        let afterMultiset = this.nodesBodyTokens.get(
            afterNode
        ) as Multiset<string>;
        let inlinedMultiset = this.nodesBodyTokens.get(
            inlinedNode
        ) as Multiset<string>;
        return CodeSimiliarity.calculateContainedWJC(
            this.idfPerToken,
            inlinedMultiset,
            afterMultiset.sub(beforeMultiset)
        );
    }

    // calculate weighted jaccard coefficient
    private static calculateWJC(
        idfMap: Map<string, number>,
        multiset1: Multiset<string>,
        multiset2: Multiset<string>
    ): number {
        let top = 0;
        let bottom = 0;

        idfMap.forEach((idf, token) => {
            top += Math.min(multiset1.get(token), multiset2.get(token)) * idf;
            bottom +=
                Math.max(multiset1.get(token), multiset2.get(token)) * idf;
        });

        return top / bottom;
    }

    // calculate contained weighted jaccard coefficient
    private static calculateContainedWJC(
        idfMap: Map<string, number>,
        multiset1: Multiset<string>,
        multiset2: Multiset<string>
    ): number {
        let top = 0;
        let bottom = 0;

        idfMap.forEach((idf, token) => {
            top += Math.min(multiset1.get(token), multiset2.get(token)) * idf;
            bottom += multiset1.get(token) * idf;
        });

        return top / bottom;
    }
}
