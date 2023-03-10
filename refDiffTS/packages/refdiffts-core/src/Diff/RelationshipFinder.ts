import { CST } from '../CST/CST';
import { CSTNode } from '../CST/CSTNode';
import { CodeSimiliarity } from './CodeSimiliarity';
import { Relationship, RelationshipType } from './Relationship';

class Match {
  constructor(
    public readonly before: CSTNode,
    public readonly after: CSTNode
  ) {}
}

export class RelationshipFinder {
  private matches: Array<Match> = [];
  private unmatchedBefore: Set<CSTNode>;
  private unmatchedAfter: Set<CSTNode>;
  private beforeToAfter: Map<CSTNode, CSTNode>;
  private afterToBefore: Map<CSTNode, CSTNode>;
  private codeSimiliarity: CodeSimiliarity;
  private readonly simThreshold = 0.5;

  private constructor(
    private readonly before: CST,
    private readonly after: CST,
    beforeFiles: Map<string, Buffer>,
    afterFiles: Map<string, Buffer>
  ) {
    this.unmatchedBefore = new Set<CSTNode>();
    this.unmatchedAfter = new Set<CSTNode>();
    this.beforeToAfter = new Map<CSTNode, CSTNode>();
    this.afterToBefore = new Map<CSTNode, CSTNode>();
    this.codeSimiliarity = new CodeSimiliarity(before, after, beforeFiles, afterFiles);

    for (let node of before) {
      this.unmatchedBefore.add(node);
    }
    for (let node of after) {
      this.unmatchedAfter.add(node);
    }
  }

  public static findRelationships(
    before: CST,
    after: CST,
    beforeFiles: Map<string, Buffer>,
    afterFiles: Map<string, Buffer>
  ): Array<Relationship> {
    let finder = new RelationshipFinder(before, after, beforeFiles, afterFiles);
    return finder.findRelationships();
  }

  public findRelationships(): Array<Relationship> {
    let relationships = new Array<Relationship>();

    this.findMatchingsByID(this.before.rootNodes, this.after.rootNodes);
    this.findMatchingsBySimiliarity();
    this.findMatchingsByChildren();
    this.resolveMatching(relationships);
    this.findNonMatchingRelationships(relationships);

    this.unmatchedBefore.forEach((before) => {
      relationships.push(
        new Relationship(before, undefined, RelationshipType.removed)
      );
    });
    this.unmatchedAfter.forEach((after) => {
      relationships.push(
        new Relationship(undefined, after, RelationshipType.added)
      );
    });

    return relationships;
  }

  private findMatchingsByID(
    beforeNodes: Array<CSTNode>,
    afterNodes: Array<CSTNode>
  ): void {
    beforeNodes.forEach((before) =>
      afterNodes.forEach((after) => {
        if (
          before.namespace === after.namespace &&
          before.localName === after.localName
        ) {
          this.addMatch(before, after);
        }
      })
    );
  }

  private findMatchingsBySimiliarity(): void {
    this.unmatchedBefore.forEach((before) =>
      this.unmatchedAfter.forEach((after) => {
        if (this.findMatchingRelationship(before, after) !== undefined) {
          this.addMatch(before, after);
        }
      })
    );
  }

  private findMatchingsByChildren(): void {
    this.unmatchedBefore.forEach((before) =>
      this.unmatchedAfter.forEach((after) => {
        if (
          this.matchingsChildren(before, after) > 1 &&
          this.codeSimiliarity.nameSim(before, after) > this.simThreshold
        ) {
          this.addMatch(before, after);
        }
      })
    );
  }

  private matchingsChildren(before: CSTNode, after: CSTNode): number {
    let count = 0;
    before.children.forEach((beforeChild) =>
      after.children.forEach((afterChild) => {
        if (this.beforeToAfter.get(beforeChild) === afterChild) {
          count++;
        }
      })
    );
    return count;
  }

  private resolveMatching(relationships: Array<Relationship>): void {
    this.matches.forEach((match) => {
      let relationshipType = this.findMatchingRelationship(
        match.before,
        match.after
      ) as RelationshipType;
      relationships.push(
        new Relationship(match.before, match.after, relationshipType)
      );
    });
  }

  private findNonMatchingRelationships(
    relationships: Array<Relationship>
  ): void {
    this.findExtractedRelationships(relationships, false);
    this.findExtractedRelationships(relationships, true);
    this.findInlinedRelationships(relationships);
  }

  private findExtractedRelationships(
    relationships: Array<Relationship>,
    moveRelationship: boolean
  ): void {
    let type = moveRelationship
      ? RelationshipType.extractAndMove
      : RelationshipType.extract;
    this.beforeToAfter.forEach((after, before) => {
      this.unmatchedAfter.forEach((extracted) => {
        if (!after.calls.has(extracted)) {
          return;
        }

        let matchingParents = this.sameParent(before, extracted);
        if (moveRelationship && matchingParents) {
          return;
        }
        if (!moveRelationship && !matchingParents) {
          return;
        }

        let extractedSim = this.codeSimiliarity.extractedSim(
          before,
          after,
          extracted
        );
        if (extractedSim > this.simThreshold) {
          relationships.push(new Relationship(before, extracted, type));
          this.unmatchedAfter.delete(extracted);
        }
      });
    });
  }

  private findInlinedRelationships(relationships: Array<Relationship>): void {
    this.unmatchedBefore.forEach((inlined) => {
      this.afterToBefore.forEach((before, after) => {
        if (!before.calls.has(inlined)) {
          return;
        }

        let inlinedSim = this.codeSimiliarity.inlineSim(before, after, inlined);
        if (inlinedSim > this.simThreshold) {
          relationships.push(
            new Relationship(inlined, after, RelationshipType.inline)
          );
          this.unmatchedBefore.delete(inlined);
        }
      });
    });
  }

  private sameParent(before: CSTNode, after: CSTNode): boolean {
    if (before.parent !== undefined && after.parent !== undefined) {
      return this.beforeToAfter.get(before.parent) === after.parent;
    }
    if (before.parent === undefined && after.parent === undefined) {
      return before.namespace === after.namespace;
    }
    return false;
  }

  private sameSignature(before: CSTNode, after: CSTNode): boolean {
    if(before.localName !== after.localName) {
      return false;
    }
    if(before.parameters === undefined && after.parameters === undefined) {
      return true;
    }
    if(before.parameters === undefined || after.parameters === undefined) {
      return false;
    }    
    if(before.parameters.length !== after.parameters.length) {
      return false;
    }
    return before.parameters.every((value, index) => value === after.parameters[index]);
  }

  private findMatchingRelationship(
    before: CSTNode,
    after: CSTNode
  ): RelationshipType | undefined {
    let codeSim = this.codeSimiliarity.sim(before, after);
    let sameParent = this.sameParent(before, after);
    let sameSignature = this.sameSignature(before, after);
    let sameName = before.localName === after.localName;
    let sameType = before.type === after.type;

    if (sameType && sameSignature && sameParent) {
      return RelationshipType.same;
    }
    if (sameType && !sameSignature && sameName && sameParent && codeSim > this.simThreshold) {
      return RelationshipType.changeSignature;
    }
    if (sameType && sameName && !sameParent && codeSim > this.simThreshold) {
      return RelationshipType.move;
    }
    if (sameType && !sameName && sameParent && codeSim > this.simThreshold) {
      return RelationshipType.rename;
    }
    if (sameType && !sameName && !sameParent && codeSim > this.simThreshold) {
      return RelationshipType.moveAndRename;
    }
    return undefined;
  }

  private addMatch(before: CSTNode, after: CSTNode): void {
    if (this.unmatchedBefore.has(before) && this.unmatchedAfter.has(after)) {
      this.unmatchedBefore.delete(before);
      this.unmatchedAfter.delete(after);
      this.beforeToAfter.set(before, after);
      this.afterToBefore.set(after, before);

      this.matches.push(new Match(before, after));
      this.findMatchingsByID(before.children, after.children);
    }
  }
}
