import { Location } from './Location';

export class CSTNode {
  public readonly children: Array<CSTNode>;
  public readonly calls: Set<CSTNode>;

  public parent: CSTNode | undefined;
  public location!: Location;
  public localName!: string;
  public namespace: string | undefined;
  public parameters: string[] | undefined;

  constructor(public readonly id: number, public readonly type: string) {
    this.children = new Array<CSTNode>();
    this.calls = new Set<CSTNode>();
  }

  addChild(child: CSTNode): void {
    this.children.push(child);
    child.parent = this;
  }

  addCall(func: CSTNode): void {
    this.calls.add(func);
  }
}
