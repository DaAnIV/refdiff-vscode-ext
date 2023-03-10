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

export class JSCodeAnalyzer implements core.SourceCodeAnalyzer {
  private id = 0;

  private readonly containers = new Set<string>([
    'FunctionDeclaration',
    'ClassDeclaration',
    'ClassMethod',
    'Program'
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
          switch (path.type) {
            case 'Program':
              this.analyzer.onProgramVisit(
                path as NodePath<types.Program>,
                state
              );
              break;
            case 'FunctionDeclaration':
              this.analyzer.onFunctionDeclartionVisit(
                path as NodePath<types.FunctionDeclaration>,
                state
              );
              break;
            case 'ClassDeclaration':
              this.analyzer.onClassDeclarationVisit(
                path as NodePath<types.ClassDeclaration>,
                state
              );
              break;
            case 'ClassMethod':
              this.analyzer.onClassMethodVisit(
                path as NodePath<types.ClassMethod>,
                state
              );
              break;
            case 'CallExpression':
              this.analyzer.onCallExpressionVisit(
                path as NodePath<types.CallExpression>,
                state
              );
              break;
          }
        },
        exit(path) {
          if (this.analyzer.containers.has(path.type)) {
            if (this.root.isEmpty()) {
              throw new Error('Exited uninitialized scope');
            }
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

  private createLocation(
    path: NodePath<types.Node>,
    state: ParserWalkState
  ): core.Location {
    let begin = path.node.start as number;
    let end = path.node.end as number;
    let bodyBegin = begin;
    let bodyEnd = end;
    let line = 0;
    if (path.node.loc !== undefined && path.node.loc !== null) {
      line = path.node.loc.start.line;
    }
    if ('body' in path.node && 'start' in path.node.body) {
      bodyBegin = path.node.body.start as number;
      bodyEnd = path.node.body.end as number;
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

  private parseTokens(file: string, tree: core.CST, tokens: Array<any>) {
    let tokensPos = new Array<core.TokenPosition>();

    tokens.forEach((token) => {
      tokensPos.push(new core.TokenPosition(token['start'], token['end']));
    });

    tree.addTokensForFile(tokens, file);
  }

  private extractParameters(nodeParams: Array<any>): string[] {
    let parameters = new Array<string>();
    nodeParams.forEach((param) => {
      parameters.push((param as types.Identifier).name);
    });

    return parameters;
  }

  private onFunctionDeclartionVisit(
    nodePath: NodePath<types.FunctionDeclaration>,
    state: ParserWalkState
  ) {
    let cstNode = new core.CSTNode(this.id++, 'Function');
    cstNode.location = this.createLocation(nodePath, state);
    cstNode.localName = (nodePath.node.id as types.Identifier).name;
    cstNode.parameters = this.extractParameters(nodePath.node.params);
    state.root.peek().addChild(cstNode);
    state.functions.set(cstNode.localName, cstNode);

    state.root.push(cstNode);
  }

  private onClassDeclarationVisit(
    nodePath: NodePath<types.ClassDeclaration>,
    state: ParserWalkState
  ) {
    let cstNode = new core.CSTNode(this.id++, 'Class');
    cstNode.location = this.createLocation(nodePath, state);
    cstNode.localName = (nodePath.node.id as types.Identifier).name;
    state.root.peek().addChild(cstNode);
    state.thisNode = cstNode;

    state.root.push(cstNode);
  }

  private onClassMethodVisit(
    nodePath: NodePath<types.ClassMethod>,
    state: ParserWalkState
  ) {
    let cstNode = new core.CSTNode(this.id++, 'Function');
    cstNode.location = this.createLocation(nodePath, state);
    cstNode.localName = (nodePath.node.key as types.Identifier).name;
    cstNode.parameters = this.extractParameters(nodePath.node.params);
    state.root.peek().addChild(cstNode);
    let fullName = (state.thisNode as core.CSTNode).localName as string;
    fullName += '.' + cstNode.localName;
    state.functions.set(fullName, cstNode);

    state.root.push(cstNode);
  }

  private onProgramVisit(
    nodePath: NodePath<types.Program>,
    state: ParserWalkState
  ) {
    let cstNode = new core.CSTNode(this.id++, 'File');
    cstNode.location = this.createLocation(nodePath, state);
    cstNode.localName = path.basename(state.filePath);
    cstNode.namespace = path.dirname(state.filePath);
    state.root.push(cstNode);
    state.tree.addRootNode(cstNode);
  }

  private onCallExpressionVisit(
    nodePath: NodePath<types.CallExpression>,
    state: ParserWalkState
  ) {
    let callerNode = state.root.peek();
    if (state.callers.get(callerNode) === undefined) {
      state.callers.set(callerNode, new Set<string>());
    }
    let calleeSet = state.callers.get(callerNode) as Set<string>;
    try {
      calleeSet.add(this.extractCalleeName(nodePath, state));
    } catch (error) {}
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
}
