import * as vscode from 'vscode';
import * as path from 'path';
import * as core from '@refdiffts/core';
import { AssertionError } from 'assert';
import {
    EmptyDocumentrovider,
    RefDiffDocumentrovider
} from './refdiffDocumentProvider';
import { RefDiffAnalyzer } from './refdiffAnalyzer';

export class RefDiffTreeItem extends vscode.TreeItem {
    public readonly nodes: Set<RefDiffRelationshipItem> =
        new Set<RefDiffRelationshipItem>();
    private parentVar?: RefDiffTreeItem;
    public documentRootID: number;

    protected getFirstDefinedNode(rel: core.Relationship): core.CSTNode {
        if (rel.before !== undefined) {
            return rel.before;
        }
        if (rel.after !== undefined) {
            return rel.after;
        }
        throw new AssertionError({ message: 'Unreachable' });
    }

    protected constructor(
        label: string | vscode.TreeItemLabel,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
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

    public click(): void {}
}

export class RefDiffRootItem extends RefDiffTreeItem {
    static documentRootIDCounter: number = 0;

    constructor(label: string, description?: string, contextValue?: string) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.description = description;
        this.contextValue = contextValue;
        this.documentRootID = RefDiffRootItem.documentRootIDCounter++;
    }

    public async refresh(
        beforeFiles: Map<string, Buffer>,
        afterFiles: Map<string, Buffer>
    ) {
        this.nodes.clear();
        RefDiffDocumentrovider.addRoot(
            this.documentRootID,
            beforeFiles,
            afterFiles
        );
        let beforeFilesPerLang = new Map<string, Map<string, Buffer>>();
        let afterFilesPerLang = new Map<string, Map<string, Buffer>>();
        for (let lang of RefDiffAnalyzer.supportedLangauges) {
            beforeFilesPerLang.set(lang, new Map<string, Buffer>());
            afterFilesPerLang.set(lang, new Map<string, Buffer>());
        }
        for (let entry of beforeFiles.entries()) {
            let lang = await RefDiffAnalyzer.getAnalyzerLanguage(entry[0]);
            if (lang === undefined) {
                continue;
            }
            beforeFilesPerLang.get(lang)!.set(entry[0], entry[1]);
        }
        for (let entry of afterFiles.entries()) {
            let lang = await RefDiffAnalyzer.getAnalyzerLanguage(entry[0]);
            if (lang === undefined) {
                continue;
            }
            afterFilesPerLang.get(lang)!.set(entry[0], entry[1]);
        }
        for (let lang of RefDiffAnalyzer.supportedLangauges) {
            this.refreshForLang(
                beforeFilesPerLang.get(lang)!,
                afterFilesPerLang.get(lang)!,
                lang
            );
        }
    }

    private refreshForLang(
        beforeFiles: Map<string, Buffer>,
        afterFiles: Map<string, Buffer>,
        language: string
    ) {
        if (beforeFiles.size === 0 && afterFiles.size === 0) {
            return;
        }
        let analyzer = RefDiffAnalyzer.getAnalyzerForLanguage(language);
        if (analyzer === undefined) {
            return;
        }

        let before = analyzer.parse(beforeFiles);
        let after = analyzer.parse(afterFiles);
        let fileElements = new Map<string, RefDiffFileRelationshipItem>();
        let nodeToNonMatchingRel = new Map<core.CSTNode, core.Relationship>();

        let relationships = core.RelationshipFinder.findRelationships(
            before,
            after,
            beforeFiles,
            afterFiles
        );
        relationships.forEach((rel) => {
            let node = this.getFirstDefinedNode(rel);
            if (node.type !== 'File') {
                return;
            }
            let diffElement = new RefDiffFileRelationshipItem(
                this,
                beforeFiles,
                afterFiles,
                rel
            );
            this.addNode(diffElement);
            if (rel.before !== undefined) {
                fileElements.set(
                    path.join(
                        rel.before.namespace as string,
                        rel.before.localName
                    ),
                    diffElement
                );
            }
            if (rel.after !== undefined) {
                fileElements.set(
                    path.join(
                        rel.after.namespace as string,
                        rel.after.localName
                    ),
                    diffElement
                );
            }
        });
        relationships.forEach((rel) => {
            let node = this.getFirstDefinedNode(rel);
            if (node.type === 'File') {
                return;
            }
            if (!this.isNonMatchingRelationship(rel)) {
                return;
            }
            if (rel.type === core.RelationshipType.inline) {
                nodeToNonMatchingRel.set(rel.after as core.CSTNode, rel);
            }
            if (
                rel.type === core.RelationshipType.extract ||
                rel.type === core.RelationshipType.extractAndMove
            ) {
                nodeToNonMatchingRel.set(rel.before as core.CSTNode, rel);
            }
        });
        relationships.forEach((rel) => {
            let node = this.getFirstDefinedNode(rel);
            if (node.type === 'File') {
                return;
            }
            if (this.isNonMatchingRelationship(rel)) {
                return;
            }
            let nonMatchRel = undefined;
            if (rel.before !== undefined && rel.after !== undefined) {
                nonMatchRel = nodeToNonMatchingRel.get(rel.before);
                if (nonMatchRel === undefined) {
                    nonMatchRel = nodeToNonMatchingRel.get(rel.after);
                }
            }
            let diffElement: RefDiffLeafRelationshipItem;
            let beforeFileElement = undefined;
            let afterFileElement = undefined;
            if (rel.before !== undefined) {
                beforeFileElement = fileElements.get(
                    rel.before.location.file
                ) as RefDiffFileRelationshipItem;
                diffElement = new RefDiffLeafRelationshipItem(
                    this,
                    beforeFileElement,
                    beforeFiles,
                    afterFiles,
                    rel,
                    vscode.TreeItemCollapsibleState.None,
                    nonMatchRel
                );
                beforeFileElement.addNode(diffElement);
            }
            if (rel.after !== undefined) {
                afterFileElement = fileElements.get(
                    rel.after.location.file
                ) as RefDiffFileRelationshipItem;
                if (afterFileElement !== beforeFileElement) {
                    diffElement = new RefDiffLeafRelationshipItem(
                        this,
                        afterFileElement,
                        beforeFiles,
                        afterFiles,
                        rel,
                        vscode.TreeItemCollapsibleState.None,
                        nonMatchRel
                    );
                    afterFileElement.addNode(diffElement);
                }
            }
        });
    }

    private isNonMatchingRelationship(rel: core.Relationship): boolean {
        return (
            rel.type >= core.RelationshipType.extractSuperType &&
            rel.type <= core.RelationshipType.inline
        );
    }
}

export abstract class RefDiffRelationshipItem extends RefDiffTreeItem {
    public modified: boolean = false;
    beforeUri!: vscode.Uri;
    afterUri!: vscode.Uri;
    diffLabel: string;

    protected constructor(
        root: RefDiffRootItem,
        beforeFiles: Map<string, Buffer>,
        afterFiles: Map<string, Buffer>,
        public readonly rel: core.Relationship,
        collapseState: vscode.TreeItemCollapsibleState,
        public readonly nonMatchingRel?: core.Relationship
    ) {
        super('', collapseState);
        this.documentRootID = root.documentRootID;

        if (rel.before !== undefined && rel.after !== undefined) {
            this.modified = this.checkModified(
                rel.before,
                rel.after,
                beforeFiles.get(rel.before.location.file) as Buffer,
                afterFiles.get(rel.after.location.file) as Buffer
            );
        }

        this.label = this.getLabel(rel, nonMatchingRel);
        this.diffLabel = this.getDiffLabel(rel, nonMatchingRel);

        let node = this.getFirstDefinedNode(rel);
        this.contextValue = node.type.toLowerCase();
        this.iconPath = new vscode.ThemeIcon(`symbol-${this.contextValue}`);
    }

    protected nodeName(node: core.CSTNode) {
        return node.localName;
    }

    protected getBeforeName(
        rel: core.Relationship,
        nonMatchingRel?: core.Relationship
    ): string {
        let name = this.nodeName(rel.before!);
        if (nonMatchingRel?.type === core.RelationshipType.inline) {
            name += `+${this.nodeName(nonMatchingRel.before!)}`;
        }

        return name;
    }

    protected getAfterName(
        rel: core.Relationship,
        nonMatchingRel?: core.Relationship
    ): string {
        let name = this.nodeName(rel.after!);
        if (
            nonMatchingRel?.type === core.RelationshipType.extract ||
            nonMatchingRel?.type === core.RelationshipType.extractAndMove
        ) {
            name += `+${this.nodeName(nonMatchingRel.after!)}`;
        }

        return name;
    }

    protected getLabel(
        rel: core.Relationship,
        nonMatchingRel?: core.Relationship
    ): string {
        let label = '';
        if (rel.before !== undefined && rel.after !== undefined) {
            label = this.getBeforeName(rel, nonMatchingRel);
            label += `->`;
            label += this.getAfterName(rel, nonMatchingRel);
        } else if (rel.before !== undefined) {
            label = this.getBeforeName(rel, nonMatchingRel);
        } else if (rel.after !== undefined) {
            label = this.getAfterName(rel, nonMatchingRel);
        }
        return label;
    }

    public click(): void {
        vscode.commands.executeCommand(
            'vscode.diff',
            this.beforeUri,
            this.afterUri,
            this.diffLabel
        );
    }

    protected abstract checkModified(
        _before: core.CSTNode,
        _after: core.CSTNode,
        _beforeBuffer: Buffer,
        _afterBuffer: Buffer
    ): boolean;

    protected getDiffLabel(
        rel: core.Relationship,
        nonMatchingRel?: core.Relationship | undefined
    ): string {
        return this.getLabel(rel, nonMatchingRel);
    }
}

class RefDiffFileRelationshipItem extends RefDiffRelationshipItem {
    constructor(
        root: RefDiffRootItem,
        beforeFiles: Map<string, Buffer>,
        afterFiles: Map<string, Buffer>,
        public readonly rel: core.Relationship
    ) {
        super(
            root,
            beforeFiles,
            afterFiles,
            rel,
            vscode.TreeItemCollapsibleState.Collapsed
        );
        this.description = this.getDescription(rel);

        if (rel.before !== undefined) {
            this.beforeUri = vscode.Uri.from({
                scheme: RefDiffDocumentrovider.scheme,
                path: rel.before.location.file,
                query: `id=${this.documentRootID}&type=before`
            });
        } else {
            this.beforeUri = vscode.Uri.from({
                scheme: EmptyDocumentrovider.scheme,
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
                scheme: EmptyDocumentrovider.scheme,
                path: rel.before?.location.file
            });
        }
    }

    protected nodeName(node: core.CSTNode) {
        return path.join(node.namespace as string, node.localName);
    }

    private getDescription(rel: core.Relationship): string {
        let description = '';
        switch (rel.type) {
            case core.RelationshipType.move:
                description += 'Moved';
                break;
            case core.RelationshipType.moveAndRename:
                description += 'Moved & renamed';
                break;
            case core.RelationshipType.rename:
                description += 'Renamed';
                break;
            case core.RelationshipType.added:
                description += 'Added';
                break;
            case core.RelationshipType.removed:
                description += 'Removed';
                break;
        }
        if (this.modified) {
            if (rel.type !== core.RelationshipType.same) {
                description += ', ';
            }
            description += 'content modified';
        }
        return description;
    }

    protected checkModified(
        _before: core.CSTNode,
        _after: core.CSTNode,
        beforeBuffer: Buffer,
        afterBuffer: Buffer
    ): boolean {
        return beforeBuffer.compare(afterBuffer) !== 0;
    }
}

class RefDiffLeafRelationshipItem extends RefDiffRelationshipItem {
    constructor(
        root: RefDiffRootItem,
        parent: RefDiffFileRelationshipItem,
        beforeFiles: Map<string, Buffer>,
        afterFiles: Map<string, Buffer>,
        public readonly rel: core.Relationship,
        collapseState: vscode.TreeItemCollapsibleState,
        nonMatchingRel?: core.Relationship
    ) {
        super(
            root,
            beforeFiles,
            afterFiles,
            rel,
            collapseState,
            nonMatchingRel
        );
        this.description = this.getDescription(parent, rel, nonMatchingRel);

        let query: string;

        if (rel.before !== undefined) {
            this.beforeUri = vscode.Uri.from({
                scheme: RefDiffDocumentrovider.scheme,
                path: rel.before.location.file,
                query:
                    `id=${this.documentRootID}&` +
                    `type=before&` +
                    `begin=${rel.before.location.begin}&` +
                    `end=${rel.before.location.end}&` +
                    `lineStart=${rel.before.location.lineStart}&` +
                    `lineEnd=${rel.before.location.lineEnd}`
            });
        } else {
            this.beforeUri = vscode.Uri.from({
                scheme: 'untitled',
                path: rel.after?.location.file
            });
        }

        if (rel.after !== undefined) {
            this.afterUri = vscode.Uri.from({
                scheme: RefDiffDocumentrovider.scheme,
                path: rel.after.location.file,
                query:
                    `id=${this.documentRootID}&` +
                    `type=after&` +
                    `begin=${rel.after.location.begin}&` +
                    `end=${rel.after.location.end}&` +
                    `lineStart=${rel.after.location.lineStart}&` +
                    `lineEnd=${rel.after.location.lineEnd}`
            });
        } else {
            this.afterUri = vscode.Uri.from({
                scheme: 'untitled',
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
                query =
                    this.beforeUri.query +
                    `&file=${nonMatchingRelNode.location.file}` +
                    `&begin=${nonMatchingRelNode.location.begin}` +
                    `&end=${nonMatchingRelNode.location.end}` +
                    `&lineStart=${nonMatchingRelNode.location.lineStart}` +
                    `&lineEnd=${nonMatchingRelNode.location.lineEnd}`;
                this.beforeUri = this.beforeUri.with({ query: query });
                break;
            case core.RelationshipType.extract:
            case core.RelationshipType.extractAndMove:
                nonMatchingRelNode = nonMatchingRel.after as core.CSTNode;
                query =
                    this.afterUri.query +
                    `&file=${nonMatchingRelNode.location.file}` +
                    `&begin=${nonMatchingRelNode.location.begin}` +
                    `&end=${nonMatchingRelNode.location.end}` +
                    `&lineStart=${nonMatchingRelNode.location.lineStart}` +
                    `&lineEnd=${nonMatchingRelNode.location.lineEnd}`;
                this.afterUri = this.afterUri.with({ query: query });
                break;
        }
    }

    private getMoveDescription(
        parent: RefDiffFileRelationshipItem,
        rel: core.Relationship
    ): string {
        let description = 'Moved ';
        if (rel.after?.location.file === parent.rel.after?.location.file) {
            description += 'here';
        } else {
            description += 'from here';
        }
        return description;
    }

    private getDescription(
        parent: RefDiffFileRelationshipItem,
        rel: core.Relationship,
        nonMatchingRel?: core.Relationship
    ): string {
        let description = '';
        switch (rel.type) {
            case core.RelationshipType.same:
                if (this.modified) {
                    description += 'Same signature and location';
                }
                break;
            case core.RelationshipType.changeSignature:
                description += 'Signature changed';
                break;
            case core.RelationshipType.move:
                description += this.getMoveDescription(parent, rel);
                break;
            case core.RelationshipType.rename:
                description += 'Renamed';
                break;
            case core.RelationshipType.moveAndRename:
                description += this.getMoveDescription(parent, rel);
                description += ' & renamed';
                break;
            case core.RelationshipType.added:
                description += 'Added';
                break;
            case core.RelationshipType.removed:
                description += 'Removed';
                break;
        }
        if (this.modified) {
            description += ', body modified';
        }

        if (nonMatchingRel === undefined) {
            return description;
        }

        switch (nonMatchingRel.type) {
            case core.RelationshipType.extract:
                description +=
                    ', ' + nonMatchingRel.after?.localName + ' was extracted';
                break;
            case core.RelationshipType.extractAndMove:
                description +=
                    ', ' +
                    nonMatchingRel.after?.localName +
                    ' was extracted and moved';
                break;
            case core.RelationshipType.inline:
                description +=
                    ', ' + nonMatchingRel.before?.localName + ' was inlined';
                break;
        }

        return description;
    }

    protected checkModified(
        before: core.CSTNode,
        after: core.CSTNode,
        beforeBuffer: Buffer,
        afterBuffer: Buffer
    ): boolean {
        return (
            beforeBuffer.compare(
                afterBuffer,
                after.location.bodyBegin,
                after.location.bodyEnd,
                before.location.bodyBegin,
                before.location.bodyEnd
            ) !== 0
        );
    }
}
