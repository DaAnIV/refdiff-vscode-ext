import { CSTNode } from '../CST/CSTNode';

export enum RelationshipType {
    same,
    convertType,
    pullUp,
    pushDown,
    changeSignature,
    move,
    rename,
    moveAndRename,

    extractSuperType,
    extract,
    extractAndMove,
    inline,

    added,
    removed
}

export class Relationship {
    constructor(
        public readonly before: CSTNode | undefined,
        public readonly after: CSTNode | undefined,
        public readonly type: RelationshipType
    ) {}

    public toString(): string {
        return '';
    }
}
