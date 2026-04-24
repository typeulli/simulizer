export default class Queue<T> {
    #buf: Array<T | undefined>;
    #head = 0;
    #tail = 0;
    #size = 0;

    constructor(capacity = 1024) {
        this.#buf = new Array(capacity);
    }

    enqueue(val: T) {
        if (this.#size === this.#buf.length) this.#grow();
        this.#buf[this.#tail] = val;
        this.#tail = (this.#tail + 1) % this.#buf.length;
        this.#size++;
    }

    dequeue(): T {
        if (this.#size === 0) throw new Error("Queue is empty");
        const val = this.#buf[this.#head];
        if (val === undefined) throw new Error("Unexpected undefined value in queue");
        this.#buf[this.#head] = undefined;   // GC Unreference
        this.#head = (this.#head + 1) % this.#buf.length;
        this.#size--;
        return val;
    }

    peek()         { return this.#buf[this.#head]; }
    get size()     { return this.#size; }
    get isEmpty()  { return this.#size === 0; }

    #grow() {
        const old = this.#buf;
        this.#buf = new Array(old.length * 2);
        for (let i = 0; i < this.#size; i++)
        this.#buf[i] = old[(this.#head + i) % old.length];
        this.#head = 0;
        this.#tail = this.#size;
    }
}