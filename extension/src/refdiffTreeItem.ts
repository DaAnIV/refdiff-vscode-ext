import * as vscode from 'vscode';
import * as path from 'path';
import * as core from '@refdiffts/core';
import * as js from '@refdiffts/js';
import { AssertionError } from 'assert';
import { RefDiffDocumentrovider } from './refdiffDocumentProvider';


export class RefDiffTreeItem extends vscode.TreeItem {
  public readonly nodes: Set<RefDiffRelationshipItem> = new Set<RefDiffRelationshipItem>;
  private parentVar?: RefDiffTreeItem;
  public documentRootID: number;

  protected getFirstDefinedNode(rel: core.Relationship): core.CSTNode {
    if (rel.before !== undefined) { return rel.before; }
    if (rel.after !== undefined) { return rel.after; }
    throw new AssertionError({ message: "Unreachable" });
  }

  protected constructor(label: string | vscode.TreeItemLabel, collapsibleState?: vscode.TreeItemCollapsibleState) {
    super(label, collapsibleState);
    this.documentRootID = -1;
  }

  public parent(): RefDiffTreeItem | undefined {
    return this.parentVar;
  }

  public addNode(node: RefDiffRelationshipItem) {
    node.parentVar = this;
    this.nodes.add(node);
  }

  public click(): void { }
}

export class RefDiffRootItem extends RefDiffTreeItem {
  static documentRootIDCounter: number = 0;

  constructor(label: string) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "root";
    this.documentRootID = RefDiffRootItem.documentRootIDCounter++;
  }

  public refresh(beforeFiles: Map<string, Buffer>, afterFiles: Map<string, Buffer>) {
    this.nodes.clear();
    RefDiffDocumentrovider.addRoot(this.documentRootID, beforeFiles, afterFiles);
    let analyzer = new js.JSCodeAnalyzer();
    let before = analyzer.parse(beforeFiles);
    let after = analyzer.parse(afterFiles);
    let fileElements = new Map<string, RefDiffFileRelationshipItem>();
    let nodeToNonMatchingRel = new Map<core.CSTNode, core.Relationship>;

    let relationships = core.RelationshipFinder.findRelationships(before, after, beforeFiles, afterFiles);
    relationships.forEach((rel) => {
      let node = this.getFirstDefinedNode(rel);
      if (node.type !== "File") {
        return;
      }
      let diffElement = new RefDiffFileRelationshipItem(this, beforeFiles, afterFiles, rel);
      this.addNode(diffElement);
      if (rel.before !== undefined) {
        fileElements.set(path.join(rel.before.namespace as string, rel.before.localName), diffElement);
      }
      if (rel.after !== undefined) {
        fileElements.set(path.join(rel.after.namespace as string, rel.after.localName), diffElement);
      }
    });
    relationships.forEach((rel) => {
      let node = this.getFirstDefinedNode(rel);
      if (node.type === "File") {
        return;
      }
      if (!this.isNonMatchingRelationship(rel)) {
        return;
      }
      if (rel.type === core.RelationshipType.inline) {
        nodeToNonMatchingRel.set(rel.after as core.CSTNode, rel);
      }
      if (rel.type === core.RelationshipType.extract || rel.type === core.RelationshipType.extractAndMove) {
        nodeToNonMatchingRel.set(rel.before as core.CSTNode, rel);
      }
    });
    relationships.forEach((rel) => {
      let node = this.getFirstDefinedNode(rel);
      if (node.type === "File") {
        return;
      }
      if (this.isNonMatchingRelationship(rel)) {
        return;
      }
      let fileElement = fileElements.get(node.location.file) as RefDiffFileRelationshipItem;
      let nonMatchRel = undefined;
      if (rel.before !== undefined && rel.after !== undefined) {
        nonMatchRel = nodeToNonMatchingRel.get(rel.before);
        if (nonMatchRel === undefined) {
          nonMatchRel = nodeToNonMatchingRel.get(rel.after);
        }
      }
      let diffElement = new RefDiffLeafRelationshipItem(this, beforeFiles, afterFiles, rel, vscode.TreeItemCollapsibleState.None, nonMatchRel);
      fileElement.addNode(diffElement);
    });
  }

  private isNonMatchingRelationship(rel: core.Relationship): boolean {
    return rel.type >= core.RelationshipType.extractSuperType && rel.type <= core.RelationshipType.inline;
  }
}

export class RefDiffRelationshipItem extends RefDiffTreeItem {
  public nonMatchRel: boolean = false;
  beforeUri!: vscode.Uri;
  afterUri!: vscode.Uri;

  protected constructor(
    root: RefDiffRootItem,
    beforeFiles: Map<string, Buffer>, afterFiles: Map<string, Buffer>,
    public readonly rel: core.Relationship,
    collapseState: vscode.TreeItemCollapsibleState,
    public readonly nonMatchingRel?: core.Relationship
  ) {
    super("", collapseState);
    this.documentRootID = root.documentRootID;

    this.label = this.getLabel(rel, nonMatchingRel);
    this.description = this.getDescription(rel, beforeFiles, afterFiles, nonMatchingRel);

    let node = this.getFirstDefinedNode(rel);
    this.contextValue = node.type.toLowerCase();
    this.iconPath = new vscode.ThemeIcon(`symbol-${this.contextValue}`);
  }

  protected nodeName(node: core.CSTNode) {
    return node.localName;
  }

  protected getLabel(rel: core.Relationship, nonMatchingRel?: core.Relationship): string {
    let label = "";
    if (rel.before !== undefined && rel.after !== undefined) {
      label = `${this.nodeName(rel.before)}`;
      if (nonMatchingRel?.type === core.RelationshipType.inline) {
        label += `+${this.nodeName(nonMatchingRel.before as core.CSTNode)}`;
      }
      label += `->${rel.after.localName}`;
      if (nonMatchingRel?.type === core.RelationshipType.extract ||
        nonMatchingRel?.type === core.RelationshipType.extractAndMove) {
        label += `+${this.nodeName(nonMatchingRel.after as core.CSTNode)}`;
      }
    } else if (rel.before !== undefined) {
      label = `${this.nodeName(rel.before)}`;
    } else if (rel.after !== undefined) {
      label += `${this.nodeName(rel.after)}`;
    }
    return label;
  }

  protected getDescription(rel: core.Relationship, beforeFiles: Map<string, Buffer>, afterFiles: Map<string, Buffer>, nonMatchingRel?: core.Relationship): string {
    let modified = false;
    let description = core.RelationshipType[rel.type];
    if (nonMatchingRel !== undefined) {
      description += ` ${core.RelationshipType[nonMatchingRel.type]}`;
    }
    if (rel.before !== undefined && rel.after !== undefined) {
      modified = this.checkModified(rel.before, rel.after,
        beforeFiles.get(rel.before.location.file) as Buffer,
        afterFiles.get(rel.after.location.file) as Buffer);
    }
    if (modified) {
      description += " modified";
    }
    return description;
  }

  protected checkModified(_before: core.CSTNode, _after: core.CSTNode, _beforeBuffer: Buffer, _afterBuffer: Buffer): boolean {
    return false;
  }

  public click(): void {
    vscode.commands.executeCommand("vscode.diff",
      this.beforeUri,
      this.afterUri,
      this.label);
  }
}

export class RefDiffLeafRelationshipItem extends RefDiffRelationshipItem {
  constructor(
    root: RefDiffRootItem,
    beforeFiles: Map<string, Buffer>, afterFiles: Map<string, Buffer>,
    public readonly rel: core.Relationship,
    collapseState: vscode.TreeItemCollapsibleState,
    nonMatchingRel?: core.Relationship
  ) {
    super(root, beforeFiles, afterFiles, rel, collapseState, nonMatchingRel);

    let query: string;

    if (rel.before !== undefined) {
      this.beforeUri = vscode.Uri.from({
        scheme: RefDiffDocumentrovider.scheme,
        path: rel.before.location.file,
        query: `id=${this.documentRootID}&` +
          `type=before&` +
          `begin=${rel.before.location.begin}&` +
          `end=${rel.before.location.end}`
      });
    } else {
      this.beforeUri = vscode.Uri.from({
        scheme: "untitled",
        path: rel.after?.location.file
      });
    }

    if (rel.after !== undefined) {
      this.afterUri = vscode.Uri.from({
        scheme: RefDiffDocumentrovider.scheme,
        path: rel.after.location.file,
        query: `id=${this.documentRootID}&` +
          `type=after&` +
          `begin=${rel.after.location.begin}&` +
          `end=${rel.after.location.end}`
      });
    } else {
      this.afterUri = vscode.Uri.from({
        scheme: "untitled",
        path: rel.before?.location.file
      });
    }
    if (nonMatchingRel === undefined) {
      return;
    }

    let nonMatchingRelNode: core.CSTNode;
    switch (nonMatchingRel.type) {
      case core.RelationshipType.inline:
        nonMatchingRelNode = nonMatchingRel.before as core.CSTNode;
        query = this.beforeUri.query +
          `&file=${nonMatchingRelNode.location.file}` +
          `&begin=${nonMatchingRelNode.location.begin}` +
          `&end=${nonMatchingRelNode.location.end}`;
        this.beforeUri = this.beforeUri.with({ query: query });
        break;
      case core.RelationshipType.extract:
      case core.RelationshipType.extractAndMove:
        nonMatchingRelNode = nonMatchingRel.after as core.CSTNode;
        query = this.afterUri.query +
          `&file=${nonMatchingRelNode.location.file}` +
          `&begin=${nonMatchingRelNode.location.begin}` +
          `&end=${nonMatchingRelNode.location.end}`;
        this.afterUri = this.afterUri.with({ query: query });
        break;

    }
  }

  protected checkModified(before: core.CSTNode, after: core.CSTNode, beforeBuffer: Buffer, afterBuffer: Buffer): boolean {
    return beforeBuffer.compare(afterBuffer,
      after.location.bodyBegin, after.location.bodyEnd,
      before.location.bodyBegin, before.location.bodyEnd) !== 0;
  }
}

export class RefDiffFileRelationshipItem extends RefDiffRelationshipItem {
  constructor(
    root: RefDiffRootItem,
    beforeFiles: Map<string, Buffer>, afterFiles: Map<string, Buffer>,
    public readonly rel: core.Relationship
  ) {
    super(root, beforeFiles, afterFiles, rel, vscode.TreeItemCollapsibleState.Collapsed);

    if (rel.before !== undefined) {
      this.beforeUri = vscode.Uri.from({
        scheme: RefDiffDocumentrovider.scheme,
        path: rel.before.location.file,
        query: `id=${this.documentRootID}&type=before`
      });
    } else {
      this.beforeUri = vscode.Uri.from({
        scheme: "untitled",
        path: rel.after?.location.file
      });
    }

    if (rel.after !== undefined) {
      this.afterUri = vscode.Uri.from({
        scheme: RefDiffDocumentrovider.scheme,
        path: rel.after.location.file,
        query: `id=${this.documentRootID}&type=after`
      });
    } else {
      this.afterUri = vscode.Uri.from({
        scheme: "untitled",
        path: rel.before?.location.file
      });
    }
  }

  protected nodeName(node: core.CSTNode) {
    return path.join(node.namespace as string, node.localName);
  }

  protected checkModified(_before: core.CSTNode, _after: core.CSTNode, beforeBuffer: Buffer, afterBuffer: Buffer): boolean {
    return beforeBuffer.compare(afterBuffer) !== 0;
  }
}
