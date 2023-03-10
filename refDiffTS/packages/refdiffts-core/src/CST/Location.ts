export class Location {
    constructor(
        public readonly file: string,
        public readonly line: number,
        public readonly begin: number,
        public readonly end: number,
        public readonly bodyBegin: number,
        public readonly bodyEnd: number
    ) {}
}
