export class TokenPosition {
  constructor(public readonly start: number, public readonly end: number) {}
}

export class TokenizedFile {
  constructor(
    public readonly file: string,
    public readonly tokens: Array<TokenPosition>
  ) {}
}
