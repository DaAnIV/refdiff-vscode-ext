import { CSTNode } from './CSTNode';
import { TokenizedFile, TokenPosition } from './TokenizedFile';

class CSTIterator implements Iterator<CSTNode> {
    private done: boolean;
    private row: Array<CSTNode>;
    private rowIndex: number;

    constructor(rootNodes: Array<CSTNode>) {
        this.done = false;
        this.row = rootNodes;
        this.rowIndex = 0;
    }

    next(): IteratorResult<CSTNode, any> {
        if (this.done) {
            return {
                done: true,
                value: undefined
            };
        }

        if (this.rowIndex === this.row.length) {
            this.row = this.getNextRow();
            this.rowIndex = 0;
            if (this.row.length === 0) {
                this.done = true;
                return {
                    done: true,
                    value: undefined
                };
            }
        }
        let result = {
            done: false,
            value: this.row[this.rowIndex]
        };

        this.rowIndex += 1;
        return result;
    }

    private getNextRow(): Array<CSTNode> {
        return this.row.map((node) => node.children).flat();
    }
}

export class CST implements Iterable<CSTNode> {
    public readonly rootNodes: Array<CSTNode>;
    public readonly tokenizedFiles: Map<String, TokenizedFile>;

    constructor() {
        this.rootNodes = new Array<CSTNode>();
        this.tokenizedFiles = new Map<String, TokenizedFile>();
    }

    addRootNode(node: CSTNode): void {
        this.rootNodes.push(node);
    }

    addTokensForFile(tokens: Array<TokenPosition>, file: string): void {
        this.tokenizedFiles.set(file, new TokenizedFile(file, tokens));
    }

    [Symbol.iterator](): Iterator<CSTNode> {
        return new CSTIterator(this.rootNodes);
    }
}
