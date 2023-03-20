import * as babel from '@babel/parser';
import * as types from '@babel/types';
import * as traverse from '@babel/traverse';
import { NodePath } from '@babel/traverse';
import { Stack } from '@datastructures-js/stack';
import * as path from 'path';

import * as core from '@refdiffts/core';

class ParserWalkState {
    public root = new Stack<core.CSTNode>();
    public thisNode: core.CSTNode | undefined;
    public functions = new Map<string, core.CSTNode>();
    public callers = new Map<core.CSTNode, Set<string>>();

    constructor(
        public analyzer: JSCodeAnalyzer,
        public tree: core.CST,
        public filePath: string,
        public fileContent: Buffer
    ) {}
}

interface NodePathHandler<T = types.Node> {
    shouldHandle(nodePath: NodePath<T>): boolean;
    isContainer(): boolean;
    handle(nodePath: NodePath<T>, state: ParserWalkState);
}

function createLocation(
    path: NodePath<types.Node>,
    state: ParserWalkState,
    body?: types.BlockStatement | types.Expression | types.ClassBody 
): core.Location {
    let begin = path.node.start as number;
    let end = path.node.end as number;
    let bodyBegin = begin;
    let bodyEnd = end;
    let line = 0;
    if (path.node.loc !== undefined && path.node.loc !== null) {
        line = path.node.loc.start.line;
    }
    if (body !== undefined && 'start' in body) {
        bodyBegin = body.start!;
        bodyEnd = body.end!;
    }

    return new core.Location(
        state.filePath,
        line,
        begin,
        end,
        bodyBegin,
        bodyEnd
    );
}

function extractParameters(nodeParams: Array<any>): string[] {
    let parameters = new Array<string>();
    nodeParams.forEach((param) => {
        parameters.push((param as types.Identifier).name);
    });

    return parameters;
}

class ProgramHandler implements NodePathHandler<types.Program> {
    shouldHandle(_: traverse.NodePath<types.Program>): boolean {
        return true;
    }

    isContainer(): boolean {
        return true;
    }

    handle(nodePath: traverse.NodePath<types.Program>, state: ParserWalkState) {
        let cstNode = new core.CSTNode(state.analyzer.id++, 'File');
        cstNode.location = createLocation(nodePath, state);
        cstNode.localName = path.basename(state.filePath);
        cstNode.namespace = path.dirname(state.filePath);
        state.root.push(cstNode);
        state.tree.addRootNode(cstNode);
    }
}

class FunctionDeclarationHandler implements NodePathHandler<types.FunctionDeclaration> {
    shouldHandle(_: traverse.NodePath<types.FunctionDeclaration>): boolean {
        return true;
    }
    
    isContainer(): boolean {
        return true;
    }

    handle(nodePath: traverse.NodePath<types.FunctionDeclaration>, state: ParserWalkState) {
        let cstNode = new core.CSTNode(state.analyzer.id++, 'Function');
        cstNode.location = createLocation(nodePath, state, nodePath.node.body);
        cstNode.localName = (nodePath.node.id as types.Identifier).name;
        cstNode.parameters = extractParameters(nodePath.node.params);
        state.root.peek().addChild(cstNode);
        state.functions.set(cstNode.localName, cstNode);

        state.root.push(cstNode);
    }
}

class ClassDeclarationHandler implements NodePathHandler<types.ClassDeclaration> {
    shouldHandle(_: traverse.NodePath<types.ClassDeclaration>): boolean {
        return true;
    }
    
    isContainer(): boolean {
        return true;
    }

    handle(nodePath: traverse.NodePath<types.ClassDeclaration>, state: ParserWalkState) {
        let cstNode = new core.CSTNode(state.analyzer.id++, 'Class');
        cstNode.location = createLocation(nodePath, state, nodePath.node.body);
        cstNode.localName = (nodePath.node.id as types.Identifier).name;
        state.root.peek().addChild(cstNode);
        state.thisNode = cstNode;

        state.root.push(cstNode);
    }
}

class ClassMethodHandler implements NodePathHandler<types.ClassMethod> {
    shouldHandle(_: traverse.NodePath<types.ClassMethod>): boolean {
        return true;
    }
    
    isContainer(): boolean {
        return true;
    }

    handle(nodePath: traverse.NodePath<types.ClassMethod>, state: ParserWalkState) {
        let cstNode = new core.CSTNode(state.analyzer.id++, 'Function');
        cstNode.location = createLocation(nodePath, state, nodePath.node.body);
        cstNode.localName = (nodePath.node.key as types.Identifier).name;
        cstNode.parameters = extractParameters(nodePath.node.params);
        state.root.peek().addChild(cstNode);
        let fullName = (state.thisNode as core.CSTNode).localName as string;
        fullName += '.' + cstNode.localName;
        state.functions.set(fullName, cstNode);

        state.root.push(cstNode);
    }
}

class VariableDeclaratorHandler implements NodePathHandler<types.VariableDeclarator> {
    shouldHandle(nodePath: traverse.NodePath<types.VariableDeclarator>): boolean {
        if (nodePath.node.init === undefined) {
            return false;
        }

        return nodePath.node.init.type === "FunctionExpression" || 
            nodePath.node.init.type === "ArrowFunctionExpression";
    }
    
    isContainer(): boolean {
        return true;
    }

    handle(nodePath: traverse.NodePath<types.VariableDeclarator>, state: ParserWalkState) {
        let cstNode = new core.CSTNode(state.analyzer.id++, 'Function');
        cstNode.localName = (nodePath.node.id as types.Identifier).name;

        if (nodePath.node.init.type === "FunctionExpression") {
            cstNode.location = createLocation(nodePath, state, nodePath.node.init.body);
            cstNode.parameters = extractParameters(nodePath.node.init.params);
        } else if (nodePath.node.init.type === "ArrowFunctionExpression") {
            cstNode.location = createLocation(nodePath, state, nodePath.node.init.body);
            cstNode.parameters = extractParameters(nodePath.node.init.params);
        }

        state.root.peek().addChild(cstNode);
        state.functions.set(cstNode.localName, cstNode);

        state.root.push(cstNode);
    }
}

class AssignmentExpressionHandler implements NodePathHandler<types.AssignmentExpression> {
    shouldHandle(nodePath: traverse.NodePath<types.AssignmentExpression>): boolean {
        let isIdentifierAssignment = nodePath.node.left.type === 'Identifier';
        let isMemberAssignment = nodePath.node.left.type === 'MemberExpression' && 
            nodePath.node.left.property.type === "Identifier";
        let isValueFunction = nodePath.node.right.type === "FunctionExpression" || 
            nodePath.node.right.type === "ArrowFunctionExpression";

        return (isIdentifierAssignment || isMemberAssignment) && isValueFunction;
    }
    
    isContainer(): boolean {
        return true;
    }

    handle(nodePath: traverse.NodePath<types.AssignmentExpression>, state: ParserWalkState) {
        let cstNode = new core.CSTNode(state.analyzer.id++, 'Function');

        if (nodePath.node.left.type === 'Identifier') {
            cstNode.localName = nodePath.node.left.name;
        } else if(nodePath.node.left.type === 'MemberExpression') {
            cstNode.localName = (nodePath.node.left.property as types.Identifier).name;
        }

        if (nodePath.node.right.type === "FunctionExpression") {
            cstNode.location = createLocation(nodePath, state, nodePath.node.right.body);
            cstNode.parameters = extractParameters(nodePath.node.right.params);
        } else if (nodePath.node.right.type === "ArrowFunctionExpression") {
            cstNode.location = createLocation(nodePath, state, nodePath.node.right.body);
            cstNode.parameters = extractParameters(nodePath.node.right.params);
        }

        state.root.peek().addChild(cstNode);
        state.functions.set(cstNode.localName, cstNode);

        state.root.push(cstNode);
    }
}

class ObjectPropertyHandler implements NodePathHandler<types.ObjectProperty> {
    shouldHandle(nodePath: traverse.NodePath<types.ObjectProperty>): boolean {
        if (nodePath.node.key.type !== 'Identifier') {
            return false;
        }

        return nodePath.node.value.type === "FunctionExpression" || 
            nodePath.node.value.type === "ArrowFunctionExpression";
    }
    
    isContainer(): boolean {
        return true;
    }

    handle(nodePath: traverse.NodePath<types.ObjectProperty>, state: ParserWalkState) {
        let cstNode = new core.CSTNode(state.analyzer.id++, 'Function');
        cstNode.localName = (nodePath.node.key as types.Identifier).name;

        if (nodePath.node.value.type === "FunctionExpression") {
            cstNode.location = createLocation(nodePath, state, nodePath.node.value.body);
            cstNode.parameters = extractParameters(nodePath.node.value.params);
        } else if (nodePath.node.value.type === "ArrowFunctionExpression") {
            cstNode.location = createLocation(nodePath, state, nodePath.node.value.body);
            cstNode.parameters = extractParameters(nodePath.node.value.params);
        }

        state.root.peek().addChild(cstNode);
        state.functions.set(cstNode.localName, cstNode);

        state.root.push(cstNode);
    }
}

class CallExpressionHandler implements NodePathHandler<types.CallExpression> {
    shouldHandle(_: traverse.NodePath<types.CallExpression>): boolean {
        return true;
    }
    
    isContainer(): boolean {
        return false;
    }

    private extractCalleeName(
        nodePath: NodePath<types.CallExpression>,
        state: ParserWalkState
    ): string {
        let callee = nodePath.node.callee;
        if (callee.type === 'Identifier') {
            return callee.name;
        }
        if (callee.type === 'MemberExpression') {
            let fullName = '';
            if (callee.object.type === 'ThisExpression') {
                fullName = (state.thisNode as core.CSTNode).localName as string;
            } else {
                throw new Error('Not supported');
            } // TODO: Add scope check
            if (callee.property.type === 'Identifier') {
                fullName += '.' + callee.property.name;
            } else {
                throw new Error('Not supported');
            }
            return fullName;
        }

        throw new Error('Not supported');
    }

    handle(nodePath: traverse.NodePath<types.CallExpression>, state: ParserWalkState) {
        let callerNode = state.root.peek();
        if (state.callers.get(callerNode) === undefined) {
            state.callers.set(callerNode, new Set<string>());
        }
        let calleeSet = state.callers.get(callerNode) as Set<string>;
        try {
            calleeSet.add(this.extractCalleeName(nodePath, state));
        } catch (error) {}
    }
}

export class JSCodeAnalyzer implements core.SourceCodeAnalyzer {
    public id: number;

    private readonly handlers = new Map<string, NodePathHandler>([
        ['Program', new ProgramHandler],
        ['FunctionDeclaration', new FunctionDeclarationHandler],
        ['ClassDeclaration', new ClassDeclarationHandler],
        ['ClassMethod', new ClassMethodHandler],
        ['VariableDeclarator', new VariableDeclaratorHandler],
        ['AssignmentExpression', new AssignmentExpressionHandler],
        ['ObjectProperty', new ObjectPropertyHandler],
        ['CallExpression', new CallExpressionHandler]
    ]);


    public parse(files: Map<string, Buffer>): core.CST {
        this.id = 0;
        let tree = new core.CST();
        files.forEach((buffer, filePath) => {
            this.parseFile(tree, filePath, buffer);
        });

        return tree;
    }

    private parseFile(tree: core.CST, file: string, buffer: Buffer) {
        let ast = babel.parse(buffer.toString(), {
            sourceType: 'module',
            sourceFilename: file,
            tokens: true
        });
        if (ast.tokens) {
            this.parseTokens(file, tree, ast.tokens);
        }

        let state = new ParserWalkState(this, tree, file, buffer);

        traverse.default<ParserWalkState>(
            ast,
            {
                enter(path) {
                    let handler = this.analyzer.handlers.get(path.type);
                    if (handler !== undefined && handler.shouldHandle(path)) {
                        handler.handle(path, this);
                    }
                },
                exit(path) {
                    let handler = state.analyzer.handlers.get(path.type);
                    if (handler !== undefined && 
                        handler.shouldHandle(path) &&
                        handler.isContainer()) {
                            this.root.pop();
                    }
                }
            },
            undefined,
            state
        );

        state.callers.forEach((value, key) => {
            value.forEach((name) => {
                let calleeNode = state.functions.get(name);
                if (calleeNode) {
                    key.addCall(calleeNode);
                }
            });
        });
    }

    private parseTokens(file: string, tree: core.CST, tokens: Array<any>) {
        let tokensPos = new Array<core.TokenPosition>();

        tokens.forEach((token) => {
            tokensPos.push(
                new core.TokenPosition(token['start'], token['end'])
            );
        });

        tree.addTokensForFile(tokens, file);
    }
}
