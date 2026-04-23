import WabtModule from "wabt";

export namespace simulizer {

    function indent(str: string, level: number = 1): string {
        const prefix = "  ".repeat(level);
        return str.split("\n").map(line => prefix + line).join("\n");
    }

    // Types

    export class Type {
        name: string;
        generic: Type[];
        constructor(name: string, generic: Type[] = []) {
            this.name = name;
            this.generic = generic;
        }
        equals(other: Type): boolean {
            if (this.name !== other.name) return false;
            if (this.generic.length !== other.generic.length) return false;
            for (let i = 0; i < this.generic.length; i++) {
                if (!this.generic[i].equals(other.generic[i])) return false;
            }
            return true;
        }
        toString(): string {
            return this.generic.length > 0
                ? `${this.name}<${this.generic.map(t => t.toString()).join(", ")}>`
                : this.name;
        }
    }

    export const void_: Type     = new Type("void");
    export const i32: Type       = new Type("i32");
    export const i64: Type       = new Type("i64");
    export const f32: Type       = new Type("f32");
    export const f64: Type       = new Type("f64");
    export const v128: Type      = new Type("v128");
    export const funcref: Type   = new Type("funcref");
    export const externref: Type = new Type("externref");

    // Array Types

    /**
     * Describes the element type and byte-width of a WebAssembly linear-memory
     * array.  The byte size of a single element is derived automatically from
     * the wasm numeric type:
     *
     *   i32 → 4 bytes   i64 → 8 bytes   f32 → 4 bytes   f64 → 8 bytes
     *
     * You can override `byteSize` when you want sub-word storage (e.g. 1 byte
     * per i32 element using i32.load8_s / i32.store8).
     *
     * Memory layout:
     *   [ptr + 0             ]  = i32  length  (number of elements)
     *   [ptr + 4             ]  = i32  capacity (number of elements allocated)
     *   [ptr + 8 + i*byteSize]  = element[i]
     *
     * The 8-byte header lets ArrayOps.length() / ArrayOps.capacity() work
     * without any out-of-band bookkeeping.
     */
    export class ArrayType<T extends Type = Type> {
        readonly elemType: T;
        readonly byteSize: number;       // bytes per element
        static readonly HEADER_SIZE = 8; // bytes reserved for (length, capacity)

        constructor(elemType: T, byteSize?: number) {
            this.elemType = elemType;
            this.byteSize = byteSize ?? ArrayType.defaultByteSize(elemType);
        }

        /** Total bytes needed to store `n` elements (header + data). */
        totalBytes(n: number): number {
            return ArrayType.HEADER_SIZE + n * this.byteSize;
        }

        /** Byte offset of element `i` relative to the array pointer. */
        elemOffset(i: number): number {
            return ArrayType.HEADER_SIZE + i * this.byteSize;
        }

        private static defaultByteSize(t: Type): number {
            if (t.equals(i32) || t.equals(f32)) return 4;
            if (t.equals(i64) || t.equals(f64)) return 8;
            throw new Error(`Cannot infer byte size for type ${t.name}; pass byteSize explicitly.`);
        }

        toString(): string {
            return `Array<${this.elemType.name}>`;
        }
    }

    // Convenience constructors
    export const i32Array = new ArrayType(i32);
    export const i64Array = new ArrayType(i64);
    export const f32Array = new ArrayType(f32);
    export const f64Array = new ArrayType(f64);
    /** 1-byte-per-element i32 array (useful for byte buffers). */
    export const byteArray = new ArrayType(i32, 1);

    // Expressions

    export abstract class Expr {
        xprtype: string;
        constructor(type: string) {
            this.xprtype = type;
        }
        abstract compile(): string;
        abstract inferType(): Type;
    }

    export class Param extends Expr {
        name: string;
        type: Type;
        constructor(name: string, type: Type) {
            super("param");
            this.name = name;
            this.type = type;
        }
        inferType(): Type { return this.type; }
        compile(): string { return `local.get $${this.name}`; }
    }

    export class Local extends Expr {
        name: string;
        type: Type;
        constructor(name: string, type: Type) {
            super("local");
            this.name = name;
            this.type = type;
        }
        inferType(): Type { return this.type; }
        compile(): string { return `local.get $${this.name}`; }
    }

    export class LocalSet extends Expr {
        local: Local;
        value: Expr;
        constructor(local: Local, value: Expr) {
            super("local_set");
            this.local = local;
            this.value = value;
        }
        inferType(): Type { return void_; }
        compile(): string {
            return `${this.value.compile()}\nlocal.set $${this.local.name}`;
        }
    }

    export class LocalTee extends Expr {
        local: Local;
        value: Expr;
        constructor(local: Local, value: Expr) {
            super("local_tee");
            this.local = local;
            this.value = value;
        }
        inferType(): Type { return this.local.type; }
        compile(): string {
            return `${this.value.compile()}\nlocal.tee $${this.local.name}`;
        }
    }

    export class Global extends Expr {
        name: string;
        type: Type;
        mutable: boolean;
        constructor(name: string, type: Type, mutable = false) {
            super("global");
            this.name = name;
            this.type = type;
            this.mutable = mutable;
        }
        inferType(): Type { return this.type; }
        compile(): string { return `global.get $${this.name}`; }
    }

    export class GlobalSet extends Expr {
        global: Global;
        value: Expr;
        constructor(global: Global, value: Expr) {
            super("global_set");
            if (!global.mutable) throw new Error(`Global $${global.name} is not mutable`);
            this.global = global;
            this.value = value;
        }
        inferType(): Type { return void_; }
        compile(): string {
            return `${this.value.compile()}\nglobal.set $${this.global.name}`;
        }
    }

    export class Const extends Expr {
        type: Type;
        value: number | bigint;
        constructor(type: Type, value: number | bigint) {
            super("const");
            if (type.equals(void_)) throw new Error("Cannot create void constant");
            this.type = type;
            this.value = value;
        }
        inferType(): Type { return this.type; }
        compile(): string {
            return `${this.type.name}.const ${this.value}`;
        }
    }

    export const i32c = (v: number) => new Const(i32, v);
    export const i64c = (v: bigint) => new Const(i64, v);
    export const f32c = (v: number) => new Const(f32, v);
    export const f64c = (v: number) => new Const(f64, v);

    export class Drop extends Expr {
        value: Expr;
        constructor(value: Expr) {
            super("drop");
            this.value = value;
        }
        inferType(): Type { return void_; }
        compile(): string { return `${this.value.compile()}\ndrop`; }
    }

    export class Select extends Expr {
        cond: Expr;
        onTrue: Expr;
        onFalse: Expr;
        constructor(cond: Expr, onTrue: Expr, onFalse: Expr) {
            super("select");
            this.cond    = cond;
            this.onTrue  = onTrue;
            this.onFalse = onFalse;
        }
        inferType(): Type { return this.onTrue.inferType(); }
        compile(): string {
            return [
                this.onTrue.compile(),
                this.onFalse.compile(),
                this.cond.compile(),
                "select",
            ].join("\n");
        }
    }

    export class Unreachable extends Expr {
        constructor() { super("unreachable"); }
        inferType(): Type { return void_; }
        compile(): string { return "unreachable"; }
    }

    export class Nop extends Expr {
        constructor() { super("nop"); }
        inferType(): Type { return void_; }
        compile(): string { return "nop"; }
    }

    // Control Flow

    export class Return extends Expr {
        value?: Expr;
        constructor(value?: Expr) {
            super("return");
            this.value = value;
        }
        inferType(): Type { return this.value ? this.value.inferType() : void_; }
        compile(): string {
            return this.value
                ? `${this.value.compile()}\nreturn`
                : "return";
        }
    }

    export class Block extends Expr {
        label: string;
        body: Expr[];
        resultType: Type;
        constructor(label: string, body: Expr[], resultType: Type = void_) {
            super("block");
            this.label      = label;
            this.body       = body;
            this.resultType = resultType;
        }
        inferType(): Type { return this.resultType; }
        compile(): string {
            const result = this.resultType.equals(void_) ? "" : ` (result ${this.resultType.name})`;
            const body   = this.body.map(e => e.compile()).join("\n");
            return `(block $${this.label}${result}\n${indent(body)}\n)`;
        }
    }

    export class Loop extends Expr {
        label: string;
        body: Expr[];
        resultType: Type;
        constructor(label: string, body: Expr[], resultType: Type = void_) {
            super("loop");
            this.label      = label;
            this.body       = body;
            this.resultType = resultType;
        }
        inferType(): Type { return this.resultType; }
        compile(): string {
            const result = this.resultType.equals(void_) ? "" : ` (result ${this.resultType.name})`;
            const body   = this.body.map(e => e.compile()).join("\n");
            return `(loop $${this.label}${result}\n${indent(body)}\n)`;
        }
    }

    export class If extends Expr {
        cond: Expr;
        then: Expr[];
        else_: Expr[];
        resultType: Type;
        constructor(cond: Expr, then: Expr[], else_: Expr[] = [], resultType: Type = void_) {
            super("if");
            this.cond       = cond;
            this.then       = then;
            this.else_      = else_;
            this.resultType = resultType;
        }
        inferType(): Type { return this.resultType; }
        compile(): string {
            const result  = this.resultType.equals(void_) ? "" : ` (result ${this.resultType.name})`;
            const thenStr = this.then.map(e => e.compile()).join("\n");
            const elseStr = this.else_.length > 0
                ? `\n(else\n${this.else_.map(e => e.compile()).join("\n")}\n)`
                : "";
            return `${this.cond.compile()}\n(if${result}\n(then\n${thenStr}\n)${elseStr}\n)`;
        }
    }

    export class Br extends Expr {
        label: string;
        value?: Expr;
        constructor(label: string, value?: Expr) {
            super("br");
            this.label = label;
            this.value = value;
        }
        inferType(): Type { return void_; }
        compile(): string {
            return this.value
                ? `${this.value.compile()}\nbr $${this.label}`
                : `br $${this.label}`;
        }
    }

    export class BrIf extends Expr {
        label: string;
        cond: Expr;
        value?: Expr;
        constructor(label: string, cond: Expr, value?: Expr) {
            super("br_if");
            this.label = label;
            this.cond  = cond;
            this.value = value;
        }
        inferType(): Type { return void_; }
        compile(): string {
            const lines: string[] = [];
            if (this.value) lines.push(this.value.compile());
            lines.push(this.cond.compile());
            lines.push(`br_if $${this.label}`);
            return lines.join("\n");
        }
    }

    export class BrTable extends Expr {
        labels: string[];
        default_: string;
        index: Expr;
        constructor(labels: string[], default_: string, index: Expr) {
            super("br_table");
            this.labels   = labels;
            this.default_ = default_;
            this.index    = index;
        }
        inferType(): Type { return void_; }
        compile(): string {
            const table = [...this.labels, this.default_].map(l => `$${l}`).join(" ");
            return `${this.index.compile()}\nbr_table ${table}`;
        }
    }

    export class Call extends Expr {
        funcName: string;
        args: Expr[];
        retType: Type;
        constructor(funcName: string, args: Expr[], retType: Type) {
            super("call");
            this.funcName = funcName;
            this.args     = args;
            this.retType  = retType;
        }
        inferType(): Type { return this.retType; }
        compile(): string {
            const argsStr = this.args.map(a => a.compile()).join("\n");
            return argsStr
                ? `${argsStr}\ncall $${this.funcName}`
                : `call $${this.funcName}`;
        }
    }

    // Memory Operations

    type MemArg = { align?: number; offset?: number };

    const memArgStr = (type: Type, suffix: string, { align, offset }: MemArg = {}): string => {
        const parts: string[] = [];
        if (offset !== undefined && offset !== 0) parts.push(`offset=${offset}`);
        if (align  !== undefined)                 parts.push(`align=${align}`);
        return `${type.name}.${suffix}${parts.length ? " " + parts.join(" ") : ""}`;
    };

    export class Load extends Expr {
        type: Type;
        ptr: Expr;
        signed: boolean;
        width?: 8 | 16 | 32;
        memArg: MemArg;
        constructor(type: Type, ptr: Expr, opts: { signed?: boolean; width?: 8 | 16 | 32; memArg?: MemArg } = {}) {
            super("load");
            if (type.equals(void_)) throw new Error("Cannot load void");
            this.type   = type;
            this.ptr    = ptr;
            this.signed = opts.signed ?? true;
            this.width  = opts.width;
            this.memArg = opts.memArg ?? {};
        }
        inferType(): Type { return this.type; }
        compile(): string {
            let suffix = "load";
            if (this.width) suffix += `${this.width}_${this.signed ? "s" : "u"}`;
            return `${this.ptr.compile()}\n${memArgStr(this.type, suffix, this.memArg)}`;
        }
    }

    export class Store extends Expr {
        type: Type;
        ptr: Expr;
        value: Expr;
        width?: 8 | 16 | 32;
        memArg: MemArg;
        constructor(type: Type, ptr: Expr, value: Expr, opts: { width?: 8 | 16 | 32; memArg?: MemArg } = {}) {
            super("store");
            this.type   = type;
            this.ptr    = ptr;
            this.value  = value;
            this.width  = opts.width;
            this.memArg = opts.memArg ?? {};
        }
        inferType(): Type { return void_; }
        compile(): string {
            const suffix = this.width ? `store${this.width}` : "store";
            return [
                this.ptr.compile(),
                this.value.compile(),
                memArgStr(this.type, suffix, this.memArg),
            ].join("\n");
        }
    }

    export class MemorySize extends Expr {
        constructor() { super("memory_size"); }
        inferType(): Type { return i32; }
        compile(): string { return "memory.size"; }
    }

    export class MemoryGrow extends Expr {
        delta: Expr;
        constructor(delta: Expr) {
            super("memory_grow");
            this.delta = delta;
        }
        inferType(): Type { return i32; }
        compile(): string { return `${this.delta.compile()}\nmemory.grow`; }
    }

    // Numeric Instructions

    export class BinOp extends Expr {
        type: Type;
        op: string;
        lhs: Expr;
        rhs: Expr;
        retType: Type;
        constructor(type: Type, op: string, lhs: Expr, rhs: Expr, retType?: Type) {
            super("binop");
            this.type    = type;
            this.op      = op;
            this.lhs     = lhs;
            this.rhs     = rhs;
            this.retType = retType ?? type;
        }
        inferType(): Type { return this.retType; }
        compile(): string {
            return `${this.lhs.compile()}\n${this.rhs.compile()}\n${this.type.name}.${this.op}`;
        }
    }

    export class UnOp extends Expr {
        type: Type;
        op: string;
        value: Expr;
        retType: Type;
        constructor(type: Type, op: string, value: Expr, retType?: Type) {
            super("unop");
            this.type    = type;
            this.op      = op;
            this.value   = value;
            this.retType = retType ?? type;
        }
        inferType(): Type { return this.retType; }
        compile(): string {
            return `${this.value.compile()}\n${this.type.name}.${this.op}`;
        }
    }

    // Array Operations

    /**
     * ArrayOps<T> generates WebAssembly instructions that operate on a sized
     * array stored in linear memory.
     *
     * Memory layout at address `ptr`:
     *   [ptr + 0] i32  — length   (number of live elements)
     *   [ptr + 4] i32  — capacity (number of allocated slots)
     *   [ptr + 8 + i * elemByteSize]  — element[i]
     *
     * All index expressions are i32.  Pointer expressions are i32.
     *
     * Usage:
     *   const arr = new ArrayOps(i32Array);
     *
     *   arr.length(ptr)          → Expr  (i32)
     *   arr.capacity(ptr)        → Expr  (i32)
     *   arr.get(ptr, idx)        → Expr  (elemType)
     *   arr.set(ptr, idx, val)   → Expr  (void)
     *   arr.setLength(ptr, n)    → Expr  (void)
     *   arr.setCapacity(ptr, n)  → Expr  (void)
     *   arr.elemPtr(ptr, idx)    → Expr  (i32)  — pointer to element[i]
     */
    export class ArrayOps<T extends Type = Type> {
        readonly arrayType: ArrayType<T>;

        constructor(arrayType: ArrayType<T>) {
            this.arrayType = arrayType;
        }

        /** Read the stored length (element count) of the array. */
        length(ptr: Expr): Expr {
            return new Load(i32, ptr, { memArg: { offset: 0 } });
        }

        /** Read the stored capacity (allocated slots) of the array. */
        capacity(ptr: Expr): Expr {
            return new Load(i32, ptr, { memArg: { offset: 4 } });
        }

        /** Write the length field. */
        setLength(ptr: Expr, n: Expr): Expr {
            return new Store(i32, ptr, n, { memArg: { offset: 0 } });
        }

        /** Write the capacity field. */
        setCapacity(ptr: Expr, n: Expr): Expr {
            return new Store(i32, ptr, n, { memArg: { offset: 4 } });
        }

        /**
         * Compute the byte address of element[i].
         *
         * Compiles to:
         *   ptr + HEADER_SIZE + i * byteSize
         *
         * When `idx` is a compile-time constant the offset is folded into the
         * load/store memArg instead of emitting an add, keeping the output
         * small and clean.
         */
        elemPtr(ptr: Expr, idx: Expr): Expr {
            const header = ArrayType.HEADER_SIZE;
            const bs     = this.arrayType.byteSize;

            // Constant-fold when both ptr and idx are Const i32
            if (ptr instanceof Const && ptr.type.equals(i32) &&
                idx instanceof Const && idx.type.equals(i32)) {
                const base = (ptr.value as number) + header + (idx.value as number) * bs;
                return new Const(i32, base);
            }

            // idx * byteSize
            const scaledIdx: Expr = bs === 1
                ? idx
                : new BinOp(i32, "mul", idx, new Const(i32, bs));

            // ptr + HEADER_SIZE + scaledIdx
            const baseAddr = new BinOp(i32, "add", ptr, new Const(i32, header));
            return new BinOp(i32, "add", baseAddr, scaledIdx);
        }

        /**
         * Load element[i].
         *
         * For sub-word element types (byteSize < native size) a narrow load is
         * used automatically (signed by default; pass `signed: false` for
         * zero-extension).
         */
        get(ptr: Expr, idx: Expr, opts: { signed?: boolean } = {}): Expr {
            const addr   = this.elemPtr(ptr, idx);
            const signed = opts.signed ?? true;
            return this._loadElem(addr, signed);
        }

        /** Store `value` at element[i]. */
        set(ptr: Expr, idx: Expr, value: Expr): Expr {
            const addr = this.elemPtr(ptr, idx);
            return this._storeElem(addr, value);
        }

        // Internal helpers──────────────

        private _loadElem(addr: Expr, signed: boolean): Expr {
            const { elemType, byteSize } = this.arrayType;
            const native = ArrayType["defaultByteSize"] ?
                this._nativeBytes(elemType) : byteSize;

            if (byteSize >= native) {
                // Full-width load
                return new Load(elemType, addr);
            }
            // Narrow load (only valid for integer types)
            const width = (byteSize * 8) as 8 | 16 | 32;
            return new Load(elemType, addr, { signed, width });
        }

        private _storeElem(addr: Expr, value: Expr): Expr {
            const { elemType, byteSize } = this.arrayType;
            const native = this._nativeBytes(elemType);

            if (byteSize >= native) {
                return new Store(elemType, addr, value);
            }
            const width = (byteSize * 8) as 8 | 16 | 32;
            return new Store(elemType, addr, value, { width });
        }

        private _nativeBytes(t: Type): number {
            if (t.equals(i32) || t.equals(f32)) return 4;
            if (t.equals(i64) || t.equals(f64)) return 8;
            return 4;
        }
    }

    // =========================================================================
    // ArrayInit — initialise an array header in memory at a known offset
    // =========================================================================

    /**
     * An Expr that emits the two stores needed to stamp an array header
     * (length + capacity) into linear memory at a constant base address.
     *
     * It produces void and is intended to be placed at the start of an init
     * function body:
     *
     *   func.add_expr(new ArrayInit(i32Array, 0x100, 0, 64));
     *
     * This generates:
     *   i32.const 0x100
     *   i32.const 0
     *   i32.store offset=0          ;; length  = 0
     *   i32.const 0x100
     *   i32.const 64
     *   i32.store offset=4          ;; capacity = 64
     */
    export class ArrayInit extends Expr {
        readonly ptr: Expr;
        readonly initialLength: number;
        readonly capacity: number;
        readonly arrayType: ArrayType;

        constructor(arrayType: ArrayType, ptr: Expr | number, initialLength: number, capacity: number) {
            super("array_init");
            this.arrayType     = arrayType;
            this.ptr           = typeof ptr === "number" ? new Const(i32, ptr) : ptr;
            this.initialLength = initialLength;
            this.capacity      = capacity;
        }

        inferType(): Type { return void_; }

        compile(): string {
            const setLen = new Store(i32, this.ptr, new Const(i32, this.initialLength), { memArg: { offset: 0 } });
            const setCap = new Store(i32, this.ptr, new Const(i32, this.capacity),      { memArg: { offset: 4 } });
            return `${setLen.compile()}\n${setCap.compile()}`;
        }
    }

    // =========================================================================
    // ArrayDef — module-level static array allocation
    // =========================================================================

    /**
     * Reserves a contiguous region in the module's linear memory for one array
     * and emits a `(data ...)` segment that pre-initialises the header.
     *
     * Call `register(module)` to attach the data segment and get back the
     * constant base-address expression you pass to ArrayOps methods.
     *
     * Example:
     *   const mod  = new ModuleDef();
     *   mod.set_memory(1);
     *
     *   const def  = new ArrayDef("scores", i32Array, 64, 0x1000);
     *   const ptr  = def.register(mod);   // ptr = i32.const 0x1000
     *   const ops  = new ArrayOps(i32Array);
     *
     *   // Inside a function body:
     *   //   ops.get(ptr, i32c(3))    → load element[3]
     *   //   ops.set(ptr, i32c(3), v) → store element[3]
     */
    export class ArrayDef {
        readonly name: string;
        readonly arrayType: ArrayType;
        readonly capacity: number;
        readonly baseOffset: number;

        constructor(name: string, arrayType: ArrayType, capacity: number, baseOffset: number) {
            this.name       = name;
            this.arrayType  = arrayType;
            this.capacity   = capacity;
            this.baseOffset = baseOffset;
        }

        /** Total bytes occupied (header + data region). */
        get byteLength(): number {
            return this.arrayType.totalBytes(this.capacity);
        }

        /** Byte offset immediately after this array (useful for packing arrays). */
        get nextOffset(): number {
            return this.baseOffset + this.byteLength;
        }

        /**
         * Write the header into the module's data section and return a
         * constant pointer expression for use with ArrayOps.
         */
        register(mod: ModuleDef, initialLength = 0): Const {
            // Build an 8-byte header: [length i32 LE, capacity i32 LE]
            const header = new Uint8Array(ArrayType.HEADER_SIZE);
            const view   = new DataView(header.buffer);
            view.setInt32(0, initialLength,   true);
            view.setInt32(4, this.capacity,    true);
            mod.add_data(this.baseOffset, header);
            return new Const(i32, this.baseOffset);
        }
    }

    // =========================================================================
    // i32 ops
    // =========================================================================

    export const i32ops = {
        // Arithmetic
        add:   (l: Expr, r: Expr) => new BinOp(i32, "add",   l, r),
        sub:   (l: Expr, r: Expr) => new BinOp(i32, "sub",   l, r),
        mul:   (l: Expr, r: Expr) => new BinOp(i32, "mul",   l, r),
        div_s: (l: Expr, r: Expr) => new BinOp(i32, "div_s", l, r),
        div_u: (l: Expr, r: Expr) => new BinOp(i32, "div_u", l, r),
        rem_s: (l: Expr, r: Expr) => new BinOp(i32, "rem_s", l, r),
        rem_u: (l: Expr, r: Expr) => new BinOp(i32, "rem_u", l, r),
        // Bitwise
        and:   (l: Expr, r: Expr) => new BinOp(i32, "and",   l, r),
        or:    (l: Expr, r: Expr) => new BinOp(i32, "or",    l, r),
        xor:   (l: Expr, r: Expr) => new BinOp(i32, "xor",   l, r),
        shl:   (l: Expr, r: Expr) => new BinOp(i32, "shl",   l, r),
        shr_s: (l: Expr, r: Expr) => new BinOp(i32, "shr_s", l, r),
        shr_u: (l: Expr, r: Expr) => new BinOp(i32, "shr_u", l, r),
        rotl:  (l: Expr, r: Expr) => new BinOp(i32, "rotl",  l, r),
        rotr:  (l: Expr, r: Expr) => new BinOp(i32, "rotr",  l, r),
        // Unary
        clz:    (v: Expr) => new UnOp(i32, "clz",    v),
        ctz:    (v: Expr) => new UnOp(i32, "ctz",    v),
        popcnt: (v: Expr) => new UnOp(i32, "popcnt", v),
        // Comparison → i32
        eqz:  (v: Expr)          => new UnOp(i32, "eqz",  v, i32),
        eq:   (l: Expr, r: Expr) => new BinOp(i32, "eq",   l, r),
        ne:   (l: Expr, r: Expr) => new BinOp(i32, "ne",   l, r),
        lt_s: (l: Expr, r: Expr) => new BinOp(i32, "lt_s", l, r),
        lt_u: (l: Expr, r: Expr) => new BinOp(i32, "lt_u", l, r),
        gt_s: (l: Expr, r: Expr) => new BinOp(i32, "gt_s", l, r),
        gt_u: (l: Expr, r: Expr) => new BinOp(i32, "gt_u", l, r),
        le_s: (l: Expr, r: Expr) => new BinOp(i32, "le_s", l, r),
        le_u: (l: Expr, r: Expr) => new BinOp(i32, "le_u", l, r),
        ge_s: (l: Expr, r: Expr) => new BinOp(i32, "ge_s", l, r),
        ge_u: (l: Expr, r: Expr) => new BinOp(i32, "ge_u", l, r),
        // Conversion → i32
        wrap_i64:        (v: Expr) => new UnOp(i32, "wrap_i64",        v, i32),
        trunc_f32_s:     (v: Expr) => new UnOp(i32, "trunc_f32_s",     v, i32),
        trunc_f32_u:     (v: Expr) => new UnOp(i32, "trunc_f32_u",     v, i32),
        trunc_sat_f32_s: (v: Expr) => new UnOp(i32, "trunc_sat_f32_s", v, i32),
        trunc_sat_f32_u: (v: Expr) => new UnOp(i32, "trunc_sat_f32_u", v, i32),
        trunc_f64_s:     (v: Expr) => new UnOp(i32, "trunc_f64_s",     v, i32),
        trunc_f64_u:     (v: Expr) => new UnOp(i32, "trunc_f64_u",     v, i32),
        trunc_sat_f64_s: (v: Expr) => new UnOp(i32, "trunc_sat_f64_s", v, i32),
        trunc_sat_f64_u: (v: Expr) => new UnOp(i32, "trunc_sat_f64_u", v, i32),
        reinterpret_f32: (v: Expr) => new UnOp(i32, "reinterpret_f32", v, i32),
        extend8_s:       (v: Expr) => new UnOp(i32, "extend8_s",       v, i32),
        extend16_s:      (v: Expr) => new UnOp(i32, "extend16_s",      v, i32),
    } as const;

    // =========================================================================
    // i64 ops
    // =========================================================================

    export const i64ops = {
        // Arithmetic
        add:   (l: Expr, r: Expr) => new BinOp(i64, "add",   l, r),
        sub:   (l: Expr, r: Expr) => new BinOp(i64, "sub",   l, r),
        mul:   (l: Expr, r: Expr) => new BinOp(i64, "mul",   l, r),
        div_s: (l: Expr, r: Expr) => new BinOp(i64, "div_s", l, r),
        div_u: (l: Expr, r: Expr) => new BinOp(i64, "div_u", l, r),
        rem_s: (l: Expr, r: Expr) => new BinOp(i64, "rem_s", l, r),
        rem_u: (l: Expr, r: Expr) => new BinOp(i64, "rem_u", l, r),
        // Bitwise
        and:   (l: Expr, r: Expr) => new BinOp(i64, "and",   l, r),
        or:    (l: Expr, r: Expr) => new BinOp(i64, "or",    l, r),
        xor:   (l: Expr, r: Expr) => new BinOp(i64, "xor",   l, r),
        shl:   (l: Expr, r: Expr) => new BinOp(i64, "shl",   l, r),
        shr_s: (l: Expr, r: Expr) => new BinOp(i64, "shr_s", l, r),
        shr_u: (l: Expr, r: Expr) => new BinOp(i64, "shr_u", l, r),
        rotl:  (l: Expr, r: Expr) => new BinOp(i64, "rotl",  l, r),
        rotr:  (l: Expr, r: Expr) => new BinOp(i64, "rotr",  l, r),
        // Unary
        clz:    (v: Expr) => new UnOp(i64, "clz",    v),
        ctz:    (v: Expr) => new UnOp(i64, "ctz",    v),
        popcnt: (v: Expr) => new UnOp(i64, "popcnt", v),
        // Comparison → i32  (WAT prefix: i64, but result type is i32)
        eqz:  (v: Expr)          => new UnOp(i64, "eqz",  v, i32),
        eq:   (l: Expr, r: Expr) => new BinOp(i64, "eq",   l, r, i32),
        ne:   (l: Expr, r: Expr) => new BinOp(i64, "ne",   l, r, i32),
        lt_s: (l: Expr, r: Expr) => new BinOp(i64, "lt_s", l, r, i32),
        lt_u: (l: Expr, r: Expr) => new BinOp(i64, "lt_u", l, r, i32),
        gt_s: (l: Expr, r: Expr) => new BinOp(i64, "gt_s", l, r, i32),
        gt_u: (l: Expr, r: Expr) => new BinOp(i64, "gt_u", l, r, i32),
        le_s: (l: Expr, r: Expr) => new BinOp(i64, "le_s", l, r, i32),
        le_u: (l: Expr, r: Expr) => new BinOp(i64, "le_u", l, r, i32),
        ge_s: (l: Expr, r: Expr) => new BinOp(i64, "ge_s", l, r, i32),
        ge_u: (l: Expr, r: Expr) => new BinOp(i64, "ge_u", l, r, i32),
        // Conversion → i64
        extend_i32_s:    (v: Expr) => new UnOp(i64, "extend_i32_s",    v, i64),
        extend_i32_u:    (v: Expr) => new UnOp(i64, "extend_i32_u",    v, i64),
        trunc_f32_s:     (v: Expr) => new UnOp(i64, "trunc_f32_s",     v, i64),
        trunc_f32_u:     (v: Expr) => new UnOp(i64, "trunc_f32_u",     v, i64),
        trunc_sat_f32_s: (v: Expr) => new UnOp(i64, "trunc_sat_f32_s", v, i64),
        trunc_sat_f32_u: (v: Expr) => new UnOp(i64, "trunc_sat_f32_u", v, i64),
        trunc_f64_s:     (v: Expr) => new UnOp(i64, "trunc_f64_s",     v, i64),
        trunc_f64_u:     (v: Expr) => new UnOp(i64, "trunc_f64_u",     v, i64),
        trunc_sat_f64_s: (v: Expr) => new UnOp(i64, "trunc_sat_f64_s", v, i64),
        trunc_sat_f64_u: (v: Expr) => new UnOp(i64, "trunc_sat_f64_u", v, i64),
        reinterpret_f64: (v: Expr) => new UnOp(i64, "reinterpret_f64", v, i64),
        extend8_s:       (v: Expr) => new UnOp(i64, "extend8_s",       v, i64),
        extend16_s:      (v: Expr) => new UnOp(i64, "extend16_s",      v, i64),
        extend32_s:      (v: Expr) => new UnOp(i64, "extend32_s",      v, i64),
    } as const;

    // =========================================================================
    // f32 ops
    // =========================================================================

    export const f32ops = {
        // Arithmetic
        add:      (l: Expr, r: Expr) => new BinOp(f32, "add",      l, r),
        sub:      (l: Expr, r: Expr) => new BinOp(f32, "sub",      l, r),
        mul:      (l: Expr, r: Expr) => new BinOp(f32, "mul",      l, r),
        div:      (l: Expr, r: Expr) => new BinOp(f32, "div",      l, r),
        min:      (l: Expr, r: Expr) => new BinOp(f32, "min",      l, r),
        max:      (l: Expr, r: Expr) => new BinOp(f32, "max",      l, r),
        copysign: (l: Expr, r: Expr) => new BinOp(f32, "copysign", l, r),
        // Unary
        abs:     (v: Expr) => new UnOp(f32, "abs",     v),
        neg:     (v: Expr) => new UnOp(f32, "neg",     v),
        sqrt:    (v: Expr) => new UnOp(f32, "sqrt",    v),
        ceil:    (v: Expr) => new UnOp(f32, "ceil",    v),
        floor:   (v: Expr) => new UnOp(f32, "floor",   v),
        trunc:   (v: Expr) => new UnOp(f32, "trunc",   v),
        nearest: (v: Expr) => new UnOp(f32, "nearest", v),
        // Comparison → i32  (WAT prefix: f32, but result type is i32)
        eq: (l: Expr, r: Expr) => new BinOp(f32, "eq", l, r, i32),
        ne: (l: Expr, r: Expr) => new BinOp(f32, "ne", l, r, i32),
        lt: (l: Expr, r: Expr) => new BinOp(f32, "lt", l, r, i32),
        gt: (l: Expr, r: Expr) => new BinOp(f32, "gt", l, r, i32),
        le: (l: Expr, r: Expr) => new BinOp(f32, "le", l, r, i32),
        ge: (l: Expr, r: Expr) => new BinOp(f32, "ge", l, r, i32),
        // Conversion → f32
        convert_i32_s:   (v: Expr) => new UnOp(f32, "convert_i32_s",   v, f32),
        convert_i32_u:   (v: Expr) => new UnOp(f32, "convert_i32_u",   v, f32),
        convert_i64_s:   (v: Expr) => new UnOp(f32, "convert_i64_s",   v, f32),
        convert_i64_u:   (v: Expr) => new UnOp(f32, "convert_i64_u",   v, f32),
        demote_f64:      (v: Expr) => new UnOp(f32, "demote_f64",       v, f32),
        reinterpret_i32: (v: Expr) => new UnOp(f32, "reinterpret_i32", v, f32),
    } as const;

    // =========================================================================
    // f64 ops
    // =========================================================================

    export const f64ops = {
        // Arithmetic
        add:      (l: Expr, r: Expr) => new BinOp(f64, "add",      l, r),
        sub:      (l: Expr, r: Expr) => new BinOp(f64, "sub",      l, r),
        mul:      (l: Expr, r: Expr) => new BinOp(f64, "mul",      l, r),
        div:      (l: Expr, r: Expr) => new BinOp(f64, "div",      l, r),
        min:      (l: Expr, r: Expr) => new BinOp(f64, "min",      l, r),
        max:      (l: Expr, r: Expr) => new BinOp(f64, "max",      l, r),
        copysign: (l: Expr, r: Expr) => new BinOp(f64, "copysign", l, r),
        // Unary
        abs:     (v: Expr) => new UnOp(f64, "abs",     v),
        neg:     (v: Expr) => new UnOp(f64, "neg",     v),
        sqrt:    (v: Expr) => new UnOp(f64, "sqrt",    v),
        ceil:    (v: Expr) => new UnOp(f64, "ceil",    v),
        floor:   (v: Expr) => new UnOp(f64, "floor",   v),
        trunc:   (v: Expr) => new UnOp(f64, "trunc",   v),
        nearest: (v: Expr) => new UnOp(f64, "nearest", v),
        // Comparison → i32  (WAT prefix: f64, but result type is i32)
        eq: (l: Expr, r: Expr) => new BinOp(f64, "eq", l, r, i32),
        ne: (l: Expr, r: Expr) => new BinOp(f64, "ne", l, r, i32),
        lt: (l: Expr, r: Expr) => new BinOp(f64, "lt", l, r, i32),
        gt: (l: Expr, r: Expr) => new BinOp(f64, "gt", l, r, i32),
        le: (l: Expr, r: Expr) => new BinOp(f64, "le", l, r, i32),
        ge: (l: Expr, r: Expr) => new BinOp(f64, "ge", l, r, i32),
        // Conversion → f64
        convert_i32_s:   (v: Expr) => new UnOp(f64, "convert_i32_s",   v, f64),
        convert_i32_u:   (v: Expr) => new UnOp(f64, "convert_i32_u",   v, f64),
        convert_i64_s:   (v: Expr) => new UnOp(f64, "convert_i64_s",   v, f64),
        convert_i64_u:   (v: Expr) => new UnOp(f64, "convert_i64_u",   v, f64),
        promote_f32:     (v: Expr) => new UnOp(f64, "promote_f32",      v, f64),
        reinterpret_i64: (v: Expr) => new UnOp(f64, "reinterpret_i64", v, f64),
    } as const;

    // =========================================================================
    // Module-level definitions
    // =========================================================================

    export class ParamDef {
        param: Param;
        constructor(param: Param) { this.param = param; }
        get name() { return this.param.name; }
        get type() { return this.param.type; }
    }

    export class LocalDef {
        local: Local;
        constructor(local: Local) { this.local = local; }
        get name() { return this.local.name; }
        get type() { return this.local.type; }
        compile(): string { return `(local $${this.name} ${this.type.name})`; }
    }

    export class FuncDef {
        name: string;
        params: ParamDef[];
        locals: LocalDef[];
        ret_type: Type;
        body: Expr[];
        exported: boolean = false;

        constructor(name: string, params: ParamDef[], ret_type: Type) {
            this.name     = name;
            this.params   = params;
            this.locals   = [];
            this.ret_type = ret_type;
            this.body     = [];
        }
        export() { this.exported = true; return this; }
        add_local(local: Local): LocalDef {
            const def = new LocalDef(local);
            this.locals.push(def);
            return def;
        }
        add_expr(expr: Expr) { this.body.push(expr); return this; }
        compile(): string {
            const params  = this.params.map(p => `(param $${p.name} ${p.type.name})`).join(" ");
            const locals  = this.locals.map(l => l.compile()).join("\n");
            const result  = this.ret_type.equals(void_) ? "" : `(result ${this.ret_type.name})`;
            const body    = this.body.map(e => e.compile()).join("\n");
            return [
                `(func $${this.name}`,
                params  ? indent(params, 2) : null,
                result  ? indent(result, 2) : null,
                locals  ? indent(locals, 2) : null,
                indent(body, 2),
                ")",
            ].filter(Boolean).join("\n");
        }
    }

    export class GlobalDef {
        global: Global;
        init: Const;
        constructor(global: Global, init: Const) {
            this.global = global;
            this.init   = init;
        }
        compile(): string {
            const mut = this.global.mutable ? "(mut " + this.global.type.name + ")" : this.global.type.name;
            return `(global $${this.global.name} ${mut} (${this.init.compile()}))`;
        }
    }

    export class MemoryDef {
        min: number;
        max?: number;
        constructor(min: number, max?: number) {
            this.min = min;
            this.max = max;
        }
        compile(): string {
            return this.max !== undefined
                ? `(memory ${this.min} ${this.max})`
                : `(memory ${this.min})`;
        }
    }

    export class DataDef {
        offset: number;
        bytes: Uint8Array;
        constructor(offset: number, bytes: Uint8Array) {
            this.offset = offset;
            this.bytes  = bytes;
        }
        compile(): string {
            const hex = Array.from(this.bytes).map(b => `\\${b.toString(16).padStart(2, "0")}`).join("");
            return `(data (i32.const ${this.offset}) "${hex}")`;
        }
    }

    export class TableDef {
        size: number;
        type: Type;
        constructor(size: number, type: Type = funcref) {
            this.size = size;
            this.type = type;
        }
        compile(): string { return `(table ${this.size} ${this.type.name})`; }
    }

    export class ImportDef {
        module: string;
        name: string;
        kind: "func" | "memory" | "global" | "table";
        internalName: string;
        descriptor: string;
        constructor(module: string, name: string, kind: "func" | "memory" | "global" | "table", internalName: string, descriptor: string) {
            this.module       = module;
            this.name         = name;
            this.kind         = kind;
            this.internalName = internalName;
            this.descriptor   = descriptor;
        }
        compile(): string {
            const descriptor = this.descriptor.trim();
            return `(import "${this.module}" "${this.name}" (${this.kind} $${this.internalName}${descriptor ? " " + descriptor : ""}))`;
        }
    }

    // =========================================================================
    // ModuleDef
    // =========================================================================

    export class ModuleDef {
        imports: ImportDef[]   = [];
        memory?: MemoryDef;
        tables: TableDef[]     = [];
        globals: GlobalDef[]   = [];
        funcs: FuncDef[]       = [];
        data: DataDef[]        = [];

        add_import(imp: ImportDef): this { this.imports.push(imp); return this; }
        set_memory(min: number, max?: number): this { this.memory = new MemoryDef(min, max); return this; }
        add_table(table: TableDef): this { this.tables.push(table); return this; }
        add_global(global: GlobalDef): this { this.globals.push(global); return this; }
        add_func(func: FuncDef): this { this.funcs.push(func); return this; }
        add_data(offset: number, bytes: Uint8Array): this { this.data.push(new DataDef(offset, bytes)); return this; }
        add_data_string(offset: number, str: string): this {
            return this.add_data(offset, new TextEncoder().encode(str));
        }

        /**
         * Convenience: declare a static array, wire up its data-section header,
         * and return an ArrayOps + pointer pair ready for use in function bodies.
         *
         *   const { ops, ptr } = mod.declare_array("scores", i32Array, 64, 0x100);
         *   fn.add_expr(ops.set(ptr, i32c(0), i32c(42)));
         */
        declare_array<T extends Type>(
            name: string,
            arrayType: ArrayType<T>,
            capacity: number,
            baseOffset: number,
            initialLength = 0,
        ): { def: ArrayDef; ops: ArrayOps<T>; ptr: Const } {
            const def = new ArrayDef(name, arrayType as ArrayType, capacity, baseOffset);
            const ptr = def.register(this, initialLength);
            const ops = new ArrayOps(arrayType);
            return { def, ops, ptr };
        }

        compile(): string {
            const sections: string[] = ["(module"];
            for (const imp  of this.imports) sections.push(imp.compile());
            if (this.memory) sections.push(this.memory.compile());
            for (const tbl  of this.tables)  sections.push(tbl.compile());
            for (const gbl  of this.globals) sections.push(gbl.compile());
            for (const fn   of this.funcs)   sections.push(fn.compile());
            for (const d    of this.data)    sections.push(d.compile());
            for (const fn of this.funcs.filter(f => f.exported)) {
                sections.push(`(export "${fn.name}" (func $${fn.name}))`);
            }
            if (this.memory) sections.push(`(export "memory" (memory 0))`);
            sections.push(")");
            return sections.join("\n");
        }

        async generate_wasm(): Promise<Uint8Array<ArrayBuffer>> {
            const wabt = await WabtModule();
            const wat  = this.compile();
            console.log("Generated WAT:\n", wat);
            const wasmModule = wabt.parseWat("module.wat", wat);
            const { buffer } = wasmModule.toBinary({});
            wasmModule.destroy();
            return buffer as Uint8Array<ArrayBuffer>;
        }

        async instantiate(imports: WebAssembly.Imports = {}): Promise<WebAssembly.Instance> {
            const wasmBuffer = await this.generate_wasm();
            const wasmModule = await WebAssembly.compile(wasmBuffer);
            return await WebAssembly.instantiate(wasmModule, imports);
        }
    }

    // =========================================================================
    // Legacy Func / function registry (backwards-compatible)
    // =========================================================================

    type CallableFunc = {
        (...args: Expr[]): simulizer.Func;
    } & simulizer.Func;

    export class Func extends Expr {
        name: string;
        params: Type[];
        result: Type;
        impl: string;
        args: Expr[] = [];
        constructor(name: string, params: Type[], result: Type, impl: string) {
            super("func");
            this.name   = name;
            this.params = params;
            this.result = result;
            this.impl   = impl;

            const self = this;
            return new Proxy((...args: Expr[]) => { self.setArgs(args); return self; }, {
                get(_t, p)    { return (self as any)[p]; },
                set(_t, p, v) { (self as any)[p] = v; return true; },
            }) as unknown as Func;
        }
        inferType(): Type { return this.result; }
        setArgs(args: Expr[]) {
            if (args.length !== this.params.length)
                throw new Error(`Expected ${this.params.length} arguments, got ${args.length}`);
            this.args = args;
        }
        compile(): string {
            if (this.args.length !== this.params.length)
                throw new Error(`Expected ${this.params.length} arguments, got ${this.args.length}`);
            return `${this.args.map(a => a.compile()).join("\n")}\n${this.impl}`;
        }
    }

    export const functions: Func[] = [];

    // i32
    functions.push(new Func("add",   [i32, i32], i32, "i32.add"));
    functions.push(new Func("sub",   [i32, i32], i32, "i32.sub"));
    functions.push(new Func("mul",   [i32, i32], i32, "i32.mul"));
    functions.push(new Func("div_s", [i32, i32], i32, "i32.div_s"));
    functions.push(new Func("div_u", [i32, i32], i32, "i32.div_u"));
    functions.push(new Func("rem_s", [i32, i32], i32, "i32.rem_s"));
    functions.push(new Func("rem_u", [i32, i32], i32, "i32.rem_u"));
    functions.push(new Func("and",   [i32, i32], i32, "i32.and"));
    functions.push(new Func("or",    [i32, i32], i32, "i32.or"));
    functions.push(new Func("xor",   [i32, i32], i32, "i32.xor"));
    functions.push(new Func("shl",   [i32, i32], i32, "i32.shl"));
    functions.push(new Func("shr_s", [i32, i32], i32, "i32.shr_s"));
    functions.push(new Func("shr_u", [i32, i32], i32, "i32.shr_u"));
    functions.push(new Func("rotl",  [i32, i32], i32, "i32.rotl"));
    functions.push(new Func("rotr",  [i32, i32], i32, "i32.rotr"));
    functions.push(new Func("clz",   [i32],      i32, "i32.clz"));
    functions.push(new Func("ctz",   [i32],      i32, "i32.ctz"));
    functions.push(new Func("popcnt",[i32],      i32, "i32.popcnt"));
    functions.push(new Func("eqz",   [i32],      i32, "i32.eqz"));
    functions.push(new Func("eq",    [i32, i32], i32, "i32.eq"));
    functions.push(new Func("ne",    [i32, i32], i32, "i32.ne"));
    functions.push(new Func("lt_s",  [i32, i32], i32, "i32.lt_s"));
    functions.push(new Func("lt_u",  [i32, i32], i32, "i32.lt_u"));
    functions.push(new Func("gt_s",  [i32, i32], i32, "i32.gt_s"));
    functions.push(new Func("gt_u",  [i32, i32], i32, "i32.gt_u"));
    functions.push(new Func("le_s",  [i32, i32], i32, "i32.le_s"));
    functions.push(new Func("le_u",  [i32, i32], i32, "i32.le_u"));
    functions.push(new Func("ge_s",  [i32, i32], i32, "i32.ge_s"));
    functions.push(new Func("ge_u",  [i32, i32], i32, "i32.ge_u"));
    // i64
    functions.push(new Func("add",   [i64, i64], i64, "i64.add"));
    functions.push(new Func("sub",   [i64, i64], i64, "i64.sub"));
    functions.push(new Func("mul",   [i64, i64], i64, "i64.mul"));
    functions.push(new Func("div_s", [i64, i64], i64, "i64.div_s"));
    functions.push(new Func("div_u", [i64, i64], i64, "i64.div_u"));
    functions.push(new Func("rem_s", [i64, i64], i64, "i64.rem_s"));
    functions.push(new Func("rem_u", [i64, i64], i64, "i64.rem_u"));
    functions.push(new Func("and",   [i64, i64], i64, "i64.and"));
    functions.push(new Func("or",    [i64, i64], i64, "i64.or"));
    functions.push(new Func("xor",   [i64, i64], i64, "i64.xor"));
    functions.push(new Func("shl",   [i64, i64], i64, "i64.shl"));
    functions.push(new Func("shr_s", [i64, i64], i64, "i64.shr_s"));
    functions.push(new Func("shr_u", [i64, i64], i64, "i64.shr_u"));
    functions.push(new Func("rotl",  [i64, i64], i64, "i64.rotl"));
    functions.push(new Func("rotr",  [i64, i64], i64, "i64.rotr"));
    functions.push(new Func("clz",   [i64],      i64, "i64.clz"));
    functions.push(new Func("ctz",   [i64],      i64, "i64.ctz"));
    functions.push(new Func("popcnt",[i64],      i64, "i64.popcnt"));
    functions.push(new Func("eqz",   [i64],      i32, "i64.eqz"));
    functions.push(new Func("eq",    [i64, i64], i32, "i64.eq"));
    functions.push(new Func("ne",    [i64, i64], i32, "i64.ne"));
    functions.push(new Func("lt_s",  [i64, i64], i32, "i64.lt_s"));
    functions.push(new Func("lt_u",  [i64, i64], i32, "i64.lt_u"));
    functions.push(new Func("gt_s",  [i64, i64], i32, "i64.gt_s"));
    functions.push(new Func("gt_u",  [i64, i64], i32, "i64.gt_u"));
    functions.push(new Func("le_s",  [i64, i64], i32, "i64.le_s"));
    functions.push(new Func("le_u",  [i64, i64], i32, "i64.le_u"));
    functions.push(new Func("ge_s",  [i64, i64], i32, "i64.ge_s"));
    functions.push(new Func("ge_u",  [i64, i64], i32, "i64.ge_u"));
    // f32
    functions.push(new Func("add",      [f32, f32], f32, "f32.add"));
    functions.push(new Func("sub",      [f32, f32], f32, "f32.sub"));
    functions.push(new Func("mul",      [f32, f32], f32, "f32.mul"));
    functions.push(new Func("div",      [f32, f32], f32, "f32.div"));
    functions.push(new Func("min",      [f32, f32], f32, "f32.min"));
    functions.push(new Func("max",      [f32, f32], f32, "f32.max"));
    functions.push(new Func("copysign", [f32, f32], f32, "f32.copysign"));
    functions.push(new Func("abs",      [f32],      f32, "f32.abs"));
    functions.push(new Func("neg",      [f32],      f32, "f32.neg"));
    functions.push(new Func("sqrt",     [f32],      f32, "f32.sqrt"));
    functions.push(new Func("ceil",     [f32],      f32, "f32.ceil"));
    functions.push(new Func("floor",    [f32],      f32, "f32.floor"));
    functions.push(new Func("trunc",    [f32],      f32, "f32.trunc"));
    functions.push(new Func("nearest",  [f32],      f32, "f32.nearest"));
    functions.push(new Func("eq",       [f32, f32], i32, "f32.eq"));
    functions.push(new Func("ne",       [f32, f32], i32, "f32.ne"));
    functions.push(new Func("lt",       [f32, f32], i32, "f32.lt"));
    functions.push(new Func("gt",       [f32, f32], i32, "f32.gt"));
    functions.push(new Func("le",       [f32, f32], i32, "f32.le"));
    functions.push(new Func("ge",       [f32, f32], i32, "f32.ge"));
    // f64
    functions.push(new Func("add",      [f64, f64], f64, "f64.add"));
    functions.push(new Func("sub",      [f64, f64], f64, "f64.sub"));
    functions.push(new Func("mul",      [f64, f64], f64, "f64.mul"));
    functions.push(new Func("div",      [f64, f64], f64, "f64.div"));
    functions.push(new Func("min",      [f64, f64], f64, "f64.min"));
    functions.push(new Func("max",      [f64, f64], f64, "f64.max"));
    functions.push(new Func("copysign", [f64, f64], f64, "f64.copysign"));
    functions.push(new Func("abs",      [f64],      f64, "f64.abs"));
    functions.push(new Func("neg",      [f64],      f64, "f64.neg"));
    functions.push(new Func("sqrt",     [f64],      f64, "f64.sqrt"));
    functions.push(new Func("ceil",     [f64],      f64, "f64.ceil"));
    functions.push(new Func("floor",    [f64],      f64, "f64.floor"));
    functions.push(new Func("trunc",    [f64],      f64, "f64.trunc"));
    functions.push(new Func("nearest",  [f64],      f64, "f64.nearest"));
    functions.push(new Func("eq",       [f64, f64], i32, "f64.eq"));
    functions.push(new Func("ne",       [f64, f64], i32, "f64.ne"));
    functions.push(new Func("lt",       [f64, f64], i32, "f64.lt"));
    functions.push(new Func("gt",       [f64, f64], i32, "f64.gt"));
    functions.push(new Func("le",       [f64, f64], i32, "f64.le"));
    functions.push(new Func("ge",       [f64, f64], i32, "f64.ge"));

    export function getFunction(name: string, signature: Type[]): CallableFunc {
        for (const func of functions) {
            if (func.name !== name) continue;
            if (func.params.length !== signature.length) continue;
            if (func.params.every((p, i) => p.equals(signature[i])))
                return func as unknown as CallableFunc;
        }
        throw new Error(`Function ${name}(${signature.map(t => t.name).join(", ")}) not found`);
    }

    export namespace pipe {
        export function load_arr_i32(wasmMemory: WebAssembly.Memory, ptr: number, cap: number): number[] | undefined {
            if (!wasmMemory) return undefined;
            const i32 = new Int32Array(wasmMemory.buffer);
            const start = (ptr + 8) >> 2;
            const elems = Array.from(i32.subarray(start, start + cap));
            return elems;
        }
        export function load_arr_f64(wasmMemory: WebAssembly.Memory, ptr: number, cap: number): number[] | undefined {
            if (!wasmMemory) return undefined;
            const f64 = new Float64Array(wasmMemory.buffer);
            const start = (ptr + 8) >> 3;
            const elems = Array.from(f64.subarray(start, start + cap));
            return elems;
        }
    }
}