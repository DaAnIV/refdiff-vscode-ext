import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as core from '@refdiffts/core';
import * as js from '@refdiffts/js';
import { AssertionError } from 'assert';
import * as tmp from 'tmp';


export class RefDiffTreeItem extends vscode.TreeItem {
  public readonly nodes: Set<RefDiffRelationshipItem> = new Set<RefDiffRelationshipItem>;

  protected getFirstDefinedNode(rel: core.Relationship): core.CSTNode {
    if (rel.before !== undefined) { return rel.before; }
    if (rel.after !== undefined) { return rel.after; }
    throw new AssertionError({ message: "Unreachable" });
  }

  protected constructor(label: string | vscode.TreeItemLabel, collapsibleState?: vscode.TreeItemCollapsibleState) {
    super(label, collapsibleState);
  }

  public click(): void { }
}

export class RefDiffRootItem extends RefDiffTreeItem {
  constructor(
    public readonly path1: string,
    public readonly path2: string
  ) {
    let label = `${path.basename(path1)}<->${path.basename(path2)}`;
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.refresh();
  }

  public refresh() {
    this.nodes.clear();
    let beforeFiles = this.getFilesFromPath(this.path1);
    let afterFiles = this.getFilesFromPath(this.path2);
    let before = js.JSCodeAnalyzer.parse(beforeFiles);
    let after = js.JSCodeAnalyzer.parse(afterFiles);
    let fileElements = new Map<string, RefDiffFileRelationshipItem>();
    let filesBuffers = new Map<string, Buffer>();
    let nodeToNonMatchingRel = new Map<core.CSTNode, core.Relationship>;

    this.contextValue = "root";

    beforeFiles.forEach(filePath => {
      filesBuffers.set(filePath, fs.readFileSync(filePath));
    });
    afterFiles.forEach(filePath => {
      filesBuffers.set(filePath, fs.readFileSync(filePath));
    });

    let relationships = core.RelationshipFinder.findRelationships(before, after);
    relationships.forEach((rel) => {
      let node = this.getFirstDefinedNode(rel);
      if (node.type !== "File") {
        return;
      }
      let diffElement = new RefDiffFileRelationshipItem(filesBuffers, rel);
      this.nodes.add(diffElement);
      if (rel.before !== undefined) {
        fileElements.set(rel.before.localName, diffElement);
      }
      if (rel.after !== undefined) {
        fileElements.set(rel.after.localName, diffElement);
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
      let fileElement = fileElements.get(path.basename(node.location.file)) as RefDiffFileRelationshipItem;
      let nonMatchRel = undefined;
      if (rel.before !== undefined && rel.after !== undefined) {
        nonMatchRel = nodeToNonMatchingRel.get(rel.before);
        if (nonMatchRel === undefined) {
          nonMatchRel = nodeToNonMatchingRel.get(rel.after);
        }
      }
      let diffElement = new RefDiffLeafRelationshipItem(filesBuffers, rel, vscode.TreeItemCollapsibleState.None, nonMatchRel);
      fileElement.nodes.add(diffElement);
    });
  }

  private isNonMatchingRelationship(rel: core.Relationship): boolean {
    return rel.type >= core.RelationshipType.extractSuperType && rel.type <= core.RelationshipType.inline;
  }

  private getFilesFromPath(pathToCheck: string): string[] {
    if (!fs.lstatSync(pathToCheck).isDirectory()) {
      return [pathToCheck];
    }
    let result: string[] = [];
    fs.readdirSync(pathToCheck).forEach((val) => {
      let fullPath = path.join(pathToCheck, val);
      result.push(...this.getFilesFromPath(fullPath));
    });
    return result;
  }
}

export class RefDiffRelationshipItem extends RefDiffTreeItem {
  public nonMatchRel: boolean = false;

  protected constructor(
    buffers: Map<string, Buffer>,
    public readonly rel: core.Relationship,
    collapseState: vscode.TreeItemCollapsibleState,
    public readonly nonMatchingRel?: core.Relationship
  ) {
    super("", collapseState);

    this.label = RefDiffRelationshipItem.getLabel(rel, nonMatchingRel);
    this.description = RefDiffRelationshipItem.getDescription(rel, buffers, nonMatchingRel);

    let node = this.getFirstDefinedNode(rel);
    this.contextValue = node.type.toLowerCase();
    this.iconPath = new vscode.ThemeIcon(`symbol-${this.contextValue}`);
  }

  protected static getLabel(rel: core.Relationship, nonMatchingRel?: core.Relationship): string {
    let label = "";
    if (rel.before !== undefined && rel.after !== undefined) {
      label = `${rel.before.localName}`;
      if (nonMatchingRel?.type === core.RelationshipType.inline) {
        label += `+${nonMatchingRel.before?.localName}`;
      }
      label += `->${rel.after.localName}`;
      if (nonMatchingRel?.type === core.RelationshipType.extract ||
        nonMatchingRel?.type === core.RelationshipType.extractAndMove) {
        label += `+${nonMatchingRel.after?.localName}`;
      }
    } else if (rel.before !== undefined) {
      label = `${rel.before.localName}`;
    } else if (rel.after !== undefined) {
      label += `${rel.after.localName}`;
    }
    return label;
  }

  protected static getDescription(rel: core.Relationship, buffers: Map<string, Buffer>, nonMatchingRel?: core.Relationship): string {
    let modified = false;
    let description = core.RelationshipType[rel.type];
    if (nonMatchingRel !== undefined) {
      description += ` ${core.RelationshipType[nonMatchingRel.type]}`;
    }
    if (rel.before !== undefined && rel.after !== undefined) {
      modified = this.checkModified(rel.before, rel.after,
        buffers.get(rel.before.location.file) as Buffer,
        buffers.get(rel.after.location.file) as Buffer);
    }
    if (modified) {
      description += " modified";
    }
    return description;
  }

  protected static checkModified(_before: core.CSTNode, _after: core.CSTNode, _beforeBuffer: Buffer, _afterBuffer: Buffer): boolean {
    return false;
  }
}

export class RefDiffLeafRelationshipItem extends RefDiffRelationshipItem {
  beforeData: string = "";
  afterData: string = "";

  constructor(
    buffers: Map<string, Buffer>,
    public readonly rel: core.Relationship,
    collapseState: vscode.TreeItemCollapsibleState,
    nonMatchingRel?: core.Relationship
  ) {
    super(buffers, rel, collapseState, nonMatchingRel);

    if (rel.before !== undefined) {
      this.beforeData = (buffers.get(rel.before.location.file) as Buffer).toString("ascii",
        rel.before.location.begin,
        rel.before.location.end);
    }

    if (rel.after !== undefined) {
      this.afterData = (buffers.get(rel.after.location.file) as Buffer).toString("ascii",
        rel.after.location.begin,
        rel.after.location.end);
    }

    if (nonMatchingRel === undefined) {
      return;
    }

    let nonMatchingRelNode: core.CSTNode;
    switch (nonMatchingRel.type) {
      case core.RelationshipType.inline:
        nonMatchingRelNode = nonMatchingRel.before as core.CSTNode;
        this.beforeData += "\n\n";
        this.beforeData += (buffers.get(nonMatchingRelNode.location.file) as Buffer).toString("ascii",
          nonMatchingRelNode.location.begin,
          nonMatchingRelNode.location.end);
        break;
      case core.RelationshipType.extract:
      case core.RelationshipType.extractAndMove:
        nonMatchingRelNode = nonMatchingRel.after as core.CSTNode;
        this.afterData += "\n\n";
        this.afterData += (buffers.get(nonMatchingRelNode.location.file) as Buffer).toString("ascii",
          nonMatchingRelNode.location.begin,
          nonMatchingRelNode.location.end);
        break;

    }
  }

  public click(): void {
    let before = tmp.fileSync({ prefix: "refdiff-", postfix: ".js" });
    let after = tmp.fileSync({ prefix: "refdiff-", postfix: ".js" });
    fs.writeFileSync(before.name, this.beforeData);
    fs.writeFileSync(after.name, this.afterData);
    vscode.commands.executeCommand("vscode.diff",
      vscode.Uri.file(before.name),
      vscode.Uri.file(after.name),
      this.label);
  }

  protected static checkModified(before: core.CSTNode, after: core.CSTNode, beforeBuffer: Buffer, afterBuffer: Buffer): boolean {
    return beforeBuffer.compare(afterBuffer,
      after.location.bodyBegin, after.location.bodyEnd,
      before.location.bodyBegin, before.location.bodyEnd) !== 0;
  }
}

export class RefDiffFileRelationshipItem extends RefDiffRelationshipItem {
  constructor(
    buffers: Map<string, Buffer>,
    public readonly rel: core.Relationship
  ) {
    super(buffers, rel, vscode.TreeItemCollapsibleState.Collapsed);
  }

  public click(): void {
    let empty = tmp.fileSync({ prefix: "refdiff-", postfix: ".js" });

    if (this.rel.before !== undefined && this.rel.after !== undefined) {
      vscode.commands.executeCommand("vscode.diff",
        vscode.Uri.file(this.rel.before.location.file),
        vscode.Uri.file(this.rel.after.location.file),
        this.label);
    } else if (this.rel.before !== undefined) {
      vscode.commands.executeCommand("vscode.diff",
        vscode.Uri.file(this.rel.before.location.file),
        vscode.Uri.file(empty.name),
        this.label);
    } else if (this.rel.after !== undefined) {
      vscode.commands.executeCommand("vscode.diff",
        vscode.Uri.file(empty.name),
        vscode.Uri.file(this.rel.after.location.file),
        this.label);
    }
  }

  protected static checkModified(_before: core.CSTNode, _after: core.CSTNode, beforeBuffer: Buffer, afterBuffer: Buffer): boolean {
    return beforeBuffer.compare(afterBuffer) !== 0;
  }
}
